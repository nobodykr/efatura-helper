// Root catch-all. It runs for every request not handled by a more specific function. Its only job
// is to trap honeypot hits and pass
// everything else straight through to the static site with next(). A normal visitor never notices.
//
// Trapped:
//   - /hp/*        : our hidden, robots-disallowed links (a human never reaches them)
//   - framework/scanner bait (wp-login, xmlrpc, .env, .git, phpmyadmin, ...): paths that DO NOT
//     exist here (static site, no PHP/WordPress/admin), so any request is a scanner or bad actor.
//
// SECURITY - the trap must never become an attack surface (no counter-attack):
//   - Capture only BOUNDED metadata from Cloudflare's own headers; never the request body.
//   - NEVER reflect any attacker-controlled value into the response (no XSS).
//   - NEVER fetch an attacker-controlled URL (no SSRF); forwarding goes to ONE fixed env sink only.
//   - Response is 100% static. Whatever later DISPLAYS these hits (admin panel) MUST escape
//     ua/ref/path - they are attacker-controlled and a stored-XSS vector if rendered raw.

import { allow } from "./_lib/ratelimit.js";

const cap = (s, n) => String(s || "").slice(0, n);
const CANONICAL_HOST = "fiscalida.de";

const BAIT = [
  /^\/wp-(login|admin|content|includes|json)/i,
  /^\/xmlrpc\.php/i,
  /(^|\/)\.env(\.|$|\/)/i,                       // .env, .env.production, .env.local, api/.env
  /^\/\.git(\/|$)/i,
  /^\/\.(hg|bzr|svn|idea)(\/|$)/i,
  /^\/\.aws(\/|$)/i,
  /^\/\.(docker|ssh)(\/|$)/i,
  /(phpmyadmin|^\/pma\/)/i,
  /^\/administrator(\/|$)/i,
  /^\/config\.php/i,
  /^\/(wp-config(?:\.php)?|phpinfo\.php|adminer\.php)([./]|$)/i,
  /\/backup\.(zip|sql|tar|gz|rar)(\?|$)/i,
  /^\/\.vscode(\/|$)/i,
  /^\/actuator(\/|$)/i,
  /\/vendor\/phpunit/i,
  /^\/(cgi-bin|solr|struts|jenkins|\.svn)(\/|$)/i,
  /^\/(jmx-console|manager\/html|host-manager\/html)(\/|$)/i,
  // modern framework/appliance scanners seen in the wild
  /^\/server-status(\/|$)/i,
  /^\/telescope(\/|$)/i,                          // Laravel Telescope
  /^\/_ignition\//i,                              // Laravel Ignition RCE probe
  /^\/_profiler\//i,                              // Symfony profiler
  /^\/wp-json\/wp\/v2\/users/i,                   // WP user enumeration
  /^\/laravel\.log|\/storage\/logs\//i,
  /^\/(?:docker-compose(?:\.[a-z0-9_-]+)?\.ya?ml|\.npmrc|composer\.(?:json|lock))(?:$|\?)/i,
  /^\/(?:debug\/default\/view|_debugbar|trace\.axd|elmah\.axd)(?:\/|$)/i,
  /^\/(?:boaform\/admin|HNAP1|goform|geoserver\/web)(?:\/|$)/i,
  /^\/\.DS_Store/i,
  /^\/autodiscover\/autodiscover\.xml/i,
  /^\/owa(\/|$)/i,
  /(^|\/)(credentials|id_rsa|\.htpasswd)(\?|$)/i,
  /^\/(druid|hudson|zabbix|grafana|kibana)\//i,
  /^\/\.well-known\/(?!security\.txt|change-password|assetlinks\.json|apple-app|acme-challenge)/i,
];

function trapKind(path) {
  if (path.startsWith("/hp/")) return "hidden-link";
  for (const re of BAIT) if (re.test(path)) return "scanner-bait";
  return null;
}

async function record(request, env, ctx, kind) {
  const url = new URL(request.url);
  // request.cf is set by Cloudflare (NOT attacker-controlled) - the actionable signals for a SAFE
  // block decision live here: botManagement.score (1=bot .. 99=human) and asn/asOrganization
  // (datacenter vs residential/mobile). "Low score + hosting ASN on scanner-bait" is near-certain
  // malicious and cannot be a real person on a shared mobile IP (they score high on a mobile ASN).
  const cf = request.cf || {};
  const hit = {
    t: new Date().toISOString(),
    kind,
    path: cap(url.pathname, 300),
    method: cap(request.method, 10),
    ip: cap(request.headers.get("CF-Connecting-IP"), 45),
    ua: cap(request.headers.get("User-Agent"), 400),
    country: cap(request.headers.get("CF-IPCountry"), 4),
    asn: cf.asn || null,
    asOrg: cap(cf.asOrganization, 80),
    bot: (cf.botManagement && typeof cf.botManagement.score === "number") ? cf.botManagement.score : null,
    verifiedBot: !!(cf.botManagement && cf.botManagement.verifiedBot),
    colo: cap(cf.colo, 8),
  };
  console.log("FB_HONEYPOT " + JSON.stringify(hit));   // greppable in Cloudflare function logs (always)
  // Persist to the private cae-db sink (env HONEYPOT_SINK, shared key HONEYPOT_KEY). Fire-and-forget
  // via waitUntil with a hard timeout: the scanner never waits on it, and a slow/blocked sink cannot
  // hold the worker. The sink URL/key are Pages secrets, never in this public source.
  // Sink is CAPPED per IP (KV): a scanner hammering /hp cannot turn our own trap into a flood against
  // the sink. console.log above is unconditional, so nothing is lost locally when the cap trips.
  let sinkOk = true;
  try {
    const c = await allow(env, { key: "hp-sink", ip: hit.ip, limit: 20, windowSec: 3600 });
    sinkOk = c.ok;
  } catch { /* fail open */ }
  if (sinkOk && env && env.HONEYPOT_SINK) {
    const p = fetch(env.HONEYPOT_SINK, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fb-hp": env.HONEYPOT_KEY || "" },
      body: JSON.stringify(hit),
      signal: AbortSignal.timeout(2500),
    }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
  }
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  if (url.hostname !== CANONICAL_HOST)
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: { "content-type": "application/json", "cache-control": "no-store",
        "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow, noarchive" }
    });
  const path = url.pathname;
  const kind = trapKind(path);
  if (!kind) return context.next();   // not a trap -> serve the real static site
  try { await record(request, context.env, context, kind); } catch { /* never fail loudly */ }
  // Tarpit: hold the trap response a beat before the 404. Mass scanners are throughput machines;
  // a few hundred ms per hit is invisible to us (idle wait, no CPU) but drags their sweep. The
  // delay is DETERMINISTIC from the path (no Math.random - forbidden here) so it is not a timer
  // oracle, and bounded so it can never approach the Functions wall-clock budget.
  let d = 0; for (let i = 0; i < path.length; i++) d = (d + path.charCodeAt(i)) % 600;
  await new Promise((r) => setTimeout(r, 300 + d));   // 300-899ms
  return new Response(
    JSON.stringify({ error: "not_found" }),
    { status: 404, headers: {
      "content-type": "application/json", "cache-control": "no-store",
      "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow, noarchive"
    } }
  );
}
