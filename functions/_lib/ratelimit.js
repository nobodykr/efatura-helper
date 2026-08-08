// Fixed-window per-IP rate limiter backed by Workers KV (binding FB_RL on the Pages project).
//
// Design notes:
//  - Fail-OPEN. If KV is missing or throws, allow the request. A limiter that blocks real users
//    when the store hiccups is worse than the abuse it prevents; the WAF rule is the hard backstop.
//  - We never store a raw IP. The key carries a non-reversible hash of cf-connecting-ip, so the
//    KV contents cannot deanonymise a visitor even if read.
//  - Fixed window (not sliding): value = count in the current [now / windowSec] bucket, written
//    with expirationTtl = windowSec so entries self-expire and KV never accumulates garbage.
//  - Best-effort increment: KV is eventually consistent, so two near-simultaneous requests can
//    both read the same count. That is fine here - the limit is an abuse ceiling, not an accountant.

// djb2, hex. Cheap, deterministic, non-reversible enough for a bucket key (not a security hash).
function hashIp(ip) {
  let h = 5381;
  const s = String(ip || "0.0.0.0");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// allow(env, { key, ip, limit, windowSec }) -> { ok, remaining }
// key   : logical bucket name, e.g. "feedback" or "hp-sink" (keeps limiters independent)
// ip    : cf-connecting-ip
// limit : max requests permitted per window
// window: window length in seconds
export async function allow(env, { key, ip, limit, windowSec }) {
  const kv = env && env.FB_RL;
  if (!kv) return { ok: true, remaining: limit }; // no binding -> fail open
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${key}:${hashIp(ip)}:${bucket}`;
  try {
    const cur = parseInt((await kv.get(k)) || "0", 10) || 0;
    if (cur >= limit) return { ok: false, remaining: 0 };
    // TTL a little past the window so a request at the edge of a bucket still expires cleanly.
    await kv.put(k, String(cur + 1), { expirationTtl: windowSec + 5 });
    return { ok: true, remaining: Math.max(0, limit - cur - 1) };
  } catch (e) {
    return { ok: true, remaining: limit }; // KV error -> fail open
  }
}
