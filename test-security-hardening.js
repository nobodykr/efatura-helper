// Security regression checks for the edge rate limiter, trap minimisation, headers and source
// hygiene. Uses synthetic addresses and never reaches a network.
const { readFileSync, readdirSync } = require("fs");

function assert(ok, message) { if (!ok) throw new Error(message); }
const limiterSource = readFileSync("functions/_lib/ratelimit.js", "utf8");
const limiterModule = "data:text/javascript;base64," + Buffer.from(limiterSource).toString("base64");

(async () => {
  const { allow } = await import(limiterModule);
  const entries = new Map();
  const kv = {
    async get(key) { return entries.get(key); },
    async put(key, value) { entries.set(key, value); }
  };
  const env = { FB_RL: kv, FB_RL_KEY: "synthetic-test-key-that-is-long-enough" };
  const input = { key: "unit", ip: "192.0.2.10", limit: 2, windowSec: 60 };
  assert((await allow(env, input)).ok, "first request was rejected");
  assert((await allow(env, input)).ok, "second request was rejected");
  assert(!(await allow(env, input)).ok, "rate ceiling was not enforced");
  const storedKey = [...entries.keys()][0];
  assert(!storedKey.includes(input.ip), "raw IP leaked into KV key");
  assert((await allow({ FB_RL: kv }, input)).ok, "missing deployment secret did not fail open");

  const trapSource = limiterSource.replace("export async function allow", "async function allow") + "\n" +
    readFileSync("functions/[[path]].js", "utf8").replace('import { allow } from "./_lib/ratelimit.js";', "");
  const trap = await import("data:text/javascript;base64," + Buffer.from(trapSource).toString("base64"));
  const alternate = await trap.onRequest({
    request: new Request("https://efatura-helper.pages.dev/"), env: {},
    next() { throw new Error("non-canonical host reached the static site"); }
  });
  assert(alternate.status === 404, "non-canonical Pages hostname was served");
  let forwarded;
  const oldFetch = global.fetch;
  global.fetch = async (_url, init) => { forwarded = JSON.parse(init.body); return new Response(null, { status: 204 }); };
  const waits = [];
  const response = await trap.onRequest({
    request: new Request("https://fiscalida.de/.docker/config.json", {
      headers: { "CF-Connecting-IP": "192.0.2.20", "User-Agent": "synthetic-scanner", "Referer": "https://example.invalid/private?q=value" }
    }),
    env: { HONEYPOT_SINK: "https://sink.invalid/trap", HONEYPOT_KEY: "synthetic", FB_RL: kv,
      FB_RL_KEY: "synthetic-test-key-that-is-long-enough" },
    waitUntil(promise) { waits.push(promise); }, next() { throw new Error("scanner bait reached static site"); }
  });
  await Promise.all(waits);
  global.fetch = oldFetch;
  assert(response.status === 404 && response.headers.get("cache-control") === "no-store", "trap response contract weakened");
  assert(forwarded && forwarded.kind === "scanner-bait", "new scanner bait was not recorded");
  assert(!Object.prototype.hasOwnProperty.call(forwarded, "ref") && !Object.prototype.hasOwnProperty.call(forwarded, "city"),
    "unnecessary request metadata was forwarded");

  const headers = readFileSync("_headers", "utf8");
  assert(/default-src 'self'/.test(headers) && /object-src 'none'/.test(headers), "full CSP baseline missing");
  const routes = JSON.parse(readFileSync("_routes.json", "utf8"));
  assert(routes.include.length === 1 && routes.include[0] === "/*" && routes.exclude.length === 0,
    "canonical host gate does not cover every Pages route");
  function textFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const path = dir === "." ? entry.name : dir + "/" + entry.name;
      if (entry.isDirectory()) out.push(...textFiles(path));
      else if (/\.(?:html|js|mjs|json|md|txt)$/.test(entry.name)) out.push(path);
    }
    return out;
  }
  const text = textFiles(".").map((name) => readFileSync(name, "utf8")).join("\n");
  const forbiddenTypography = [String.fromCodePoint(0x2014), "&" + "mdash;", "&#" + "8212;", "&#x" + "2014;"];
  assert(!forbiddenTypography.some((marker) => text.toLowerCase().includes(marker.toLowerCase())),
    "em dash marker found in public source");
  console.log("  edge limiter, honeypot minimisation and security headers passed");
})().catch((error) => { console.error(error); process.exit(1); });
