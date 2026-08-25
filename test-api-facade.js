// The browser facade is an allowlist, not a general proxy. Test routing, body caps, header
// minimisation and the fixed HTTPS upstream without making a network request.
const { readFileSync } = require("fs");

function assert(ok, message) { if (!ok) throw new Error(message); }
const limiter = readFileSync("functions/_lib/ratelimit.js", "utf8")
  .replace("export async function allow", "async function allow");
const facade = readFileSync("functions/api/v1/[[path]].js", "utf8")
  .replace('import { allow } from "../../_lib/ratelimit.js";', "");
const source = limiter + "\n" + facade;

(async () => {
  const mod = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  async function call(path, method = "GET", body, env = {}) {
    const init = { method, headers: { cookie: "must-not-forward", authorization: "must-not-forward" } };
    if (body !== undefined) { init.body = body; init.headers["content-type"] = "application/json"; }
    return mod.onRequest({
      request: new Request("https://fiscalida.de/api/v1/" + path + "?member=member_123", init),
      params: { path: path.split("/") }, env
    });
  }

  assert((await call("companies/500000009")).status === 404, "retired company lookup is still proxied");
  assert((await call("https://attacker.invalid/x")).status === 404, "arbitrary URL reached proxy route");
  assert((await call("map/buckets/009", "POST", "{}")).status === 405, "wrong method not rejected");
  assert((await call("map/rules", "POST", "{}")).status === 405, "rules write method not rejected");
  assert((await call("contributions/impact", "POST", undefined)).status === 415, "non-JSON write not rejected");
  assert((await call("map/rules")).status === 503, "reviewable rules route is missing or bypassed configuration");
  assert((await call("not-allowlisted", "OPTIONS")).status === 404, "OPTIONS bypassed route allowlist");
  assert((await call("map/buckets/009")).status === 503, "missing upstream did not fail closed");
  assert((await call("map/buckets/009", "GET", undefined, { FISCALIDADE_API_ORIGIN: "http://internal" })).status === 503,
    "non-HTTPS upstream accepted");
  const large = JSON.stringify({ value: "x".repeat(70 * 1024) });
  assert((await call("contributions/impact", "POST", large)).status === 413, "body cap not enforced");
  assert((await call("intake", "POST", large, { FISCALIDADE_API_ORIGIN: "https://cae.invalid" })).status === 503,
    "market intake fell back to the CAE API origin");
  assert((await call("intake", "POST", "{}", { FISCALIDADE_MARKET_ORIGIN: "https://market.invalid" })).status === 503,
    "market intake forwarded without its dedicated facade credential");
  const tooLargeIntake = JSON.stringify({ value: "x".repeat(1024 * 1024 + 1) });
  assert((await call("intake", "POST", tooLargeIntake)).status === 413, "market intake body cap not enforced");

  let forwarded;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    forwarded = { url: String(url), init };
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "content-type": "application/json", "x-upstream-secret": "drop" }
    });
  };
  const env = {
    FISCALIDADE_API_ORIGIN: "https://internal-api.invalid/private-prefix",
    FISCALIDADE_API_CLIENT_ID: "test-id", FISCALIDADE_API_CLIENT_SECRET: "test-secret"
  };
  const response = await call("households/" + "ab".repeat(32), "DELETE", undefined, env);
  assert(response.status === 200, "allowed route was not proxied");
  assert(forwarded.url === "https://internal-api.invalid/api/v1/households/" + "ab".repeat(32) + "?member=member_123",
    "upstream was not fixed to the reviewed path");
  assert(!forwarded.init.headers.has("cookie") && !forwarded.init.headers.has("authorization"), "browser secrets forwarded");
  assert(forwarded.init.headers.get("cf-access-client-id") === "test-id", "service credential not applied server-side");
  assert(!response.headers.has("x-upstream-secret"), "unreviewed upstream header leaked");
  assert(response.headers.get("x-robots-tag") === "noindex, nofollow, noarchive", "API noindex missing");
  const options = await call("contributions/impact", "OPTIONS");
  assert(options.headers.get("access-control-allow-methods") === "POST, OPTIONS", "route-specific CORS methods missing");
  await call("map/rules", "GET", undefined, env);
  assert(forwarded.url === "https://internal-api.invalid/api/v1/map/rules", "unreviewed query leaked upstream");
  const marketEnv = {
    FISCALIDADE_API_ORIGIN: "https://internal-api.invalid",
    FISCALIDADE_MARKET_ORIGIN: "https://market-api.invalid/private",
    FISCALIDADE_MARKET_KEY: "dedicated-market-key",
    FISCALIDADE_MARKET_CLIENT_ID: "market-id", FISCALIDADE_MARKET_CLIENT_SECRET: "market-secret"
  };
  const marketResponse = await call("intake", "POST", "{}", marketEnv);
  assert(forwarded.url === "https://market-api.invalid/api/v1/intake", "intake did not use its isolated origin");
  assert(forwarded.init.headers.get("cf-access-client-id") === "market-id", "dedicated market credential not applied");
  assert(forwarded.init.headers.get("x-fiscalidade-market-key") === "dedicated-market-key",
    "dedicated market API key not applied server-side");
  assert(marketResponse.headers.get("access-control-allow-origin") === "https://fiscalida.de",
    "browser market intake is not pinned to the profile origin");
  global.fetch = originalFetch;
  console.log("  API facade allowlist and header boundary passed");
})().catch((error) => { console.error(error); process.exit(1); });
