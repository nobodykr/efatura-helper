// Fixed-window per-IP rate limiter backed by Workers KV (binding FB_RL on the Pages project).
//
// Design notes:
//  - Fail-OPEN. If KV is missing or throws, allow the request. A limiter that blocks real users
//    when the store hiccups is worse than the abuse it prevents; the WAF rule is the hard backstop.
//  - We never store a raw IP. The key carries an HMAC-SHA-256 pseudonym keyed by FB_RL_KEY, so an
//    exported KV namespace cannot be used to enumerate the small IPv4 address space.
//  - Fixed window (not sliding): value = count in the current [now / windowSec] bucket, written
//    with expirationTtl = windowSec so entries self-expire and KV never accumulates garbage.
//  - Best-effort increment: KV is eventually consistent, so two near-simultaneous requests can
//    both read the same count. That is fine here - the limit is an abuse ceiling, not an accountant.

const enc = new TextEncoder();

async function visitorKey(secret, namespace, ip) {
  if (typeof secret !== "string" || secret.length < 24) return null;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const data = enc.encode(`fiscalidade-rate-v1\n${namespace}\n${String(ip || "unknown").slice(0, 64)}`);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return Array.from(digest.slice(0, 16), (value) => value.toString(16).padStart(2, "0")).join("");
}

// allow(env, { key, ip, limit, windowSec }) -> { ok, remaining }
// key   : logical bucket name, e.g. "feedback" or "hp-sink" (keeps limiters independent)
// ip    : cf-connecting-ip
// limit : max requests permitted per window
// window: window length in seconds
export async function allow(env, { key, ip, limit, windowSec }) {
  const kv = env && env.FB_RL;
  const secret = env && env.FB_RL_KEY;
  if (!kv || !secret) return { ok: true, remaining: limit }; // missing deployment binding -> fail open
  if (!/^[a-z0-9:_-]{1,64}$/i.test(String(key || "")) || !Number.isInteger(limit) || limit < 1 ||
      !Number.isInteger(windowSec) || windowSec < 1)
    return { ok: true, remaining: limit };
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  try {
    const visitor = await visitorKey(secret, key, ip);
    if (!visitor) return { ok: true, remaining: limit };
    const k = `rl:${key}:${visitor}:${bucket}`;
    const cur = parseInt((await kv.get(k)) || "0", 10) || 0;
    if (cur >= limit) return { ok: false, remaining: 0 };
    // TTL a little past the window so a request at the edge of a bucket still expires cleanly.
    await kv.put(k, String(cur + 1), { expirationTtl: windowSec + 5 });
    return { ok: true, remaining: Math.max(0, limit - cur - 1) };
  } catch (e) {
    return { ok: true, remaining: limit }; // KV error -> fail open
  }
}
