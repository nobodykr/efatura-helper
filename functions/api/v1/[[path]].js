/* Same-origin Fiscalidade API facade.
 *
 * The upstream origin and optional Access service-token values are deployment secrets. They are
 * never returned, logged, or placed in client code. Only the reviewed /api/v1 contract is proxied;
 * arbitrary paths, headers and bodies are rejected locally.
 */
const MAX_BODY = 64 * 1024;
const ROUTES = [
  { re: /^map\/buckets\/\d{3}$/, methods: ["GET"] },
  { re: /^map\/rules$/, methods: ["GET"] },
  { re: /^contributions\/(merchant|shapes|impact)$/, methods: ["POST"] },
  { re: /^households\/[a-f0-9]{32,128}$/, methods: ["GET", "PUT", "DELETE"] },
  { re: /^stats(?:\/impact)?$/, methods: ["GET"] },
];

function cors(headers) {
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
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
    return new Response(null, { status: 204, headers: cors(new Headers()) });
  if (!route.methods.includes(request.method))
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: cors(new Headers({ "content-type": "application/json" }))
    });

  const declared = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(declared) || declared > MAX_BODY)
    return new Response(JSON.stringify({ error: "body_too_large" }), {
      status: 413, headers: cors(new Headers({ "content-type": "application/json" }))
    });

  let body;
  if (request.method === "POST" || request.method === "PUT") {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY)
      return new Response(JSON.stringify({ error: "body_too_large" }), {
        status: 413, headers: cors(new Headers({ "content-type": "application/json" }))
      });
  }

  const upstreamBase = context.env && context.env.FISCALIDADE_API_ORIGIN;
  if (!upstreamBase)
    return new Response(JSON.stringify({ error: "internal_preview_not_configured" }), {
      status: 503, headers: cors(new Headers({ "content-type": "application/json" }))
    });
  let upstream;
  try {
    const base = new URL(upstreamBase);
    if (base.protocol !== "https:") throw new Error("https required");
    upstream = new URL("/api/v1/" + raw, base);
  } catch {
    return new Response(JSON.stringify({ error: "internal_preview_not_configured" }), {
      status: 503, headers: cors(new Headers({ "content-type": "application/json" }))
    });
  }
  const incoming = new URL(request.url);
  if (/^households\//.test(raw) && request.method === "DELETE") {
    const keys = [...incoming.searchParams.keys()];
    const member = incoming.searchParams.get("member") || "";
    if (keys.length !== 1 || keys[0] !== "member" || !/^[A-Za-z0-9_-]{8,64}$/.test(member))
      return new Response(JSON.stringify({ error: "bad_member" }), {
        status: 400, headers: cors(new Headers({ "content-type": "application/json" }))
      });
    upstream.searchParams.set("member", member);
  }
  const headers = new Headers({ "accept": "application/json" });
  if (body) headers.set("content-type", "application/json");
  if (context.env.FISCALIDADE_API_CLIENT_ID && context.env.FISCALIDADE_API_CLIENT_SECRET) {
    headers.set("cf-access-client-id", context.env.FISCALIDADE_API_CLIENT_ID);
    headers.set("cf-access-client-secret", context.env.FISCALIDADE_API_CLIENT_SECRET);
  }

  try {
    const response = await fetch(upstream, { method: request.method, headers, body, redirect: "manual" });
    const out = new Headers();
    for (const name of ["content-type", "cache-control", "etag", "retry-after"])
      if (response.headers.has(name)) out.set(name, response.headers.get(name));
    return new Response(response.body, { status: response.status, headers: cors(out) });
  } catch {
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
      status: 502, headers: cors(new Headers({ "content-type": "application/json" }))
    });
  }
}
