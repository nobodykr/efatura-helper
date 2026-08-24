/* Same-origin Fiscalidade API facade.
 *
 * The upstream origin and optional Access service-token values are deployment secrets. They are
 * never returned, logged, or placed in client code. Only the reviewed /api/v1 contract is proxied;
 * arbitrary paths, headers and bodies are rejected locally.
 */
import { allow } from "../../_lib/ratelimit.js";

const DEFAULT_MAX_BODY = 64 * 1024;
const ROUTES = [
  { re: /^map\/buckets\/\d{3}$/, methods: ["GET"], bucket: "map", limit: 450 },
  { re: /^map\/rules$/, methods: ["GET"], bucket: "rules", limit: 180 },
  { re: /^contributions\/(merchant|shapes|impact)$/, methods: ["POST"], bucket: "contribution", limit: 80 },
  // Separate service and database: this route never falls back to the CAE/company API origin.
  { re: /^intake$/, methods: ["POST"], bucket: "market-intake", limit: 30, maxBody: 1024 * 1024, market: true },
  { re: /^households\/[a-f0-9]{32,128}$/, methods: ["GET", "PUT", "DELETE"], bucket: "household", limit: 180 },
  { re: /^stats(?:\/impact)?$/, methods: ["GET"], bucket: "stats", limit: 180 },
];

function cors(headers, methods = ["GET"]) {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", methods.concat("OPTIONS").join(", "));
  headers.set("access-control-allow-headers", "content-type");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

export async function onRequest(context) {
  const request = context.request;
  const raw = Array.isArray(context.params.path) ? context.params.path.join("/") : String(context.params.path || "");
  const route = ROUTES.find((r) => r.re.test(raw));
  if (!route)
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: cors(new Headers({ "content-type": "application/json" }))
    });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(new Headers(), route.methods) });
  if (!route.methods.includes(request.method))
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: cors(new Headers({ "content-type": "application/json", "allow": route.methods.join(", ") }), route.methods)
    });

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rate = await allow(context.env, {
    key: `api-${route.bucket}-${request.method.toLowerCase()}`, ip, limit: route.limit, windowSec: 60
  });
  if (!rate.ok)
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429, headers: cors(new Headers({ "content-type": "application/json", "retry-after": "60" }), route.methods)
    });

  const declared = Number(request.headers.get("content-length") || 0);
  const maxBody = route.maxBody || DEFAULT_MAX_BODY;
  if (!Number.isFinite(declared) || declared < 0)
    return new Response(JSON.stringify({ error: "bad_content_length" }), {
      status: 400, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
    });
  if (declared > maxBody)
    return new Response(JSON.stringify({ error: "body_too_large" }), {
      status: 413, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
    });

  let body;
  if (request.method === "POST" || request.method === "PUT") {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || ""))
      return new Response(JSON.stringify({ error: "json_required" }), {
        status: 415, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
      });
    body = await request.arrayBuffer();
    if (body.byteLength > maxBody)
      return new Response(JSON.stringify({ error: "body_too_large" }), {
        status: 413, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
      });
  }

  const upstreamBase = context.env && (route.market
    ? context.env.FISCALIDADE_MARKET_ORIGIN : context.env.FISCALIDADE_API_ORIGIN);
  if (!upstreamBase)
    return new Response(JSON.stringify({ error: "internal_preview_not_configured" }), {
      status: 503, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
    });
  let upstream;
  try {
    const base = new URL(upstreamBase);
    if (base.protocol !== "https:") throw new Error("https required");
    upstream = new URL("/api/v1/" + raw, base);
  } catch {
    return new Response(JSON.stringify({ error: "internal_preview_not_configured" }), {
      status: 503, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
    });
  }
  const incoming = new URL(request.url);
  if (/^households\//.test(raw) && request.method === "DELETE") {
    const keys = [...incoming.searchParams.keys()];
    const member = incoming.searchParams.get("member") || "";
    if (keys.length !== 1 || keys[0] !== "member" || !/^[A-Za-z0-9_-]{8,64}$/.test(member))
      return new Response(JSON.stringify({ error: "bad_member" }), {
        status: 400, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
      });
    upstream.searchParams.set("member", member);
  }
  const headers = new Headers({ "accept": "application/json" });
  if (body) headers.set("content-type", "application/json");
  const clientId = route.market ? context.env.FISCALIDADE_MARKET_CLIENT_ID : context.env.FISCALIDADE_API_CLIENT_ID;
  const clientSecret = route.market ? context.env.FISCALIDADE_MARKET_CLIENT_SECRET : context.env.FISCALIDADE_API_CLIENT_SECRET;
  if (clientId && clientSecret) {
    headers.set("cf-access-client-id", clientId);
    headers.set("cf-access-client-secret", clientSecret);
  }

  try {
    const response = await fetch(upstream, { method: request.method, headers, body, redirect: "manual" });
    const out = new Headers();
    for (const name of ["content-type", "cache-control", "etag", "retry-after"])
      if (response.headers.has(name)) out.set(name, response.headers.get(name));
    return new Response(response.body, { status: response.status, headers: cors(out, route.methods) });
  } catch {
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
      status: 502, headers: cors(new Headers({ "content-type": "application/json" }), route.methods)
    });
  }
}
