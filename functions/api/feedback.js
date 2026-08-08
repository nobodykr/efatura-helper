// Feedback form endpoint. No account, no captcha puzzle: Turnstile does the work invisibly.
//
// Four independent layers, because Turnstile alone is one bypass away from an open relay:
// Delivery goes to faturaboa@diogoandrade.com, a per-service alias on the admin@ catch-all
// (Mailu on the OVH VPS). Mailu is the authoritative inbox; Gmail is legacy. Using a distinct
// alias per service is the established privacy pattern - it can be filtered or killed on its own
// without touching anything else.
//
//   1. Turnstile token, verified server-side against Cloudflare (never trust the client's word).
//   2. Honeypot field a human never sees and never fills.
//   3. Minimum dwell time: a real person cannot read the form and submit in under 3 seconds.
//   4. Hard length caps, so a pass through the gate still cannot post a novel.
//   5. Content sanitising: code/HTML rejected, control and zero-width characters stripped.
//      Ported from recibo-certo's feedback-sanitize.ts - see the block below.
//   6. Per-IP rate limit (KV, this file) + an edge WAF rate-limit rule on the same path. The KV
//      layer is precise and global; the WAF rule blocks floods before they even reach this code.

import { allow } from "../_lib/ratelimit.js";

const MAX = { message: 4000, email: 200, context: 300 };
const MIN_DWELL_MS = 3000;
const RL = { limit: 5, windowSec: 900 };   // 5 submissions / 15 min / IP

/* ---- 5. content sanitising, ported from recibo-certo/src/lib/feedback-sanitize.ts --------------
 * The four gates above stop bots. These two stop CONTENT: a human who passes Turnstile can still
 * paste a <script> or hide zero-width characters in the message, and that text is later rendered
 * as HTML in an email client.
 *
 * The same two functions exist client-side in index.html so the person gets told immediately
 * instead of after a round trip. THIS copy is the authoritative one - the client's is a courtesy
 * and can be bypassed by anyone posting straight to the endpoint. If one changes, change both.
 *
 * The first alternative requires `<` to be followed by a letter, `!` or `/` - a real tag - so an
 * arithmetic comparison like "dedução < 250 > 0" is not flagged as code. */
const DANGEROUS =
  /<\/?[a-z!][^>]*>|<\s*script|javascript:|vbscript:|on[a-z]+\s*=|data:text\/html|srcdoc\s*=|\{\{[\s\S]*\}\}|<%[\s\S]*%>/i;

const hasCode = (s) => DANGEROUS.test(s);

/** Strips tags, control characters, and the zero-width/BOM set used to hide payloads. */
function sanitise(s) {
  let out = "";
  for (const ch of String(s).replace(/<\/?[a-z!][^>]*>/gi, "")) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue;   // control, keep tab/newline
    if (c === 0x7f) continue;                                            // DEL
    if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0x2060 || c === 0xfeff) continue;
    out += ch;
  }
  return out.trim();
}

const bad = (msg, code = 400) =>
  new Response(JSON.stringify({ ok: false, error: msg }), {
    status: code, headers: { "content-type": "application/json" },
  });

export async function onRequestPost({ request, env }) {
  // 6. rate limit FIRST - cheapest gate, and it protects the Turnstile verify call downstream
  //    from being used as a free oracle. Fail-open inside allow(): a KV hiccup never blocks a user.
  const ip = request.headers.get("cf-connecting-ip") || "";
  const rl = await allow(env, { key: "feedback", ip, limit: RL.limit, windowSec: RL.windowSec });
  if (!rl.ok) return bad("Demasiados pedidos. Tenta mais tarde.", 429);

  let body;
  try { body = await request.json(); } catch { return bad("Pedido invalido."); }

  // 2. honeypot - silently accept so a bot cannot tell it failed
  if (body.website) return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" } });

  // 3. dwell time. Measured entirely client-side and sent as a duration: comparing the visitor's
  //    clock to ours would lock out anyone whose clock runs a few seconds ahead. A bot can lie
  //    about it either way, so Turnstile and the honeypot are the real gates; this is just cheap.
  const dwell = Number(body.elapsed);
  if (!Number.isFinite(dwell) || dwell < MIN_DWELL_MS) return bad("Demasiado rapido. Tenta outra vez.");

  // Length is checked on the RAW input, before sanitising: otherwise a 40.000-character payload of
  // zero-width characters passes the cap by collapsing to nothing after cleaning.
  const raw = { message: String(body.message || ""), email: String(body.email || ""),
                context: String(body.context || "") };
  for (const [k, v] of Object.entries(raw))
    if (v.length > MAX[k]) return bad("Mensagem demasiado longa.");

  // 5a. reject code outright rather than silently stripping it - a person pasting a snippet should
  //     be told, not have their message quietly altered
  if (hasCode(raw.message) || hasCode(raw.context))
    return bad("A mensagem parece conter codigo ou HTML. Tira-o e tenta outra vez.");

  // 5b. sanitise what is left
  const message = sanitise(raw.message);
  const email   = sanitise(raw.email);
  const context = sanitise(raw.context);
  if (!message) return bad("Escreve a mensagem.");
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return bad("Email invalido.");

  // 1. Turnstile, server-side
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const form = new FormData();
  form.append("secret", env.FORMS_TURNSTILE_SECRET);
  form.append("response", String(body.token || ""));
  if (ip) form.append("remoteip", ip);
  const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form });
  const ts = await tsRes.json().catch(() => ({ success: false }));
  if (!ts.success) return bad("Verificacao falhou. Recarrega a pagina.", 403);

  const esc = (s) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const mail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: "Fatura Boa <faturas@send.diogoandrade.com>",
      to: [env.FEEDBACK_TO],
      reply_to: email || undefined,
      subject: `Feedback Fatura Boa${context ? ": " + context.slice(0, 60) : ""}`,
      html: `<p><b>Mensagem</b></p><pre style="white-space:pre-wrap;font:14px ui-monospace,monospace">${esc(message)}</pre>`
          + `<p><b>Contexto:</b> ${context ? esc(context) : "(nenhum)"}</p>`
          + `<p><b>Responder a:</b> ${email ? esc(email) : "(nao deixou email)"}</p>`,
    }),
  });
  if (!mail.ok) return bad("Nao consegui enviar. Tenta o GitHub.", 502);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
}

export const onRequest = () => new Response("Method Not Allowed", { status: 405 });
