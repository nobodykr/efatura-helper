// Feedback form endpoint. No account, no captcha puzzle: Turnstile does the work invisibly.
//
// Four independent layers, because Turnstile alone is one bypass away from an open relay:
//   1. Turnstile token, verified server-side against Cloudflare (never trust the client's word).
//   2. Honeypot field a human never sees and never fills.
//   3. Minimum dwell time: a real person cannot read the form and submit in under 3 seconds.
//   4. Hard length caps, so a pass through the gate still cannot post a novel.
// Network-level rate limiting is a WAF rule on this path, not application code.

const MAX = { message: 4000, email: 200, context: 300 };
const MIN_DWELL_MS = 3000;

const bad = (msg, code = 400) =>
  new Response(JSON.stringify({ ok: false, error: msg }), {
    status: code, headers: { "content-type": "application/json" },
  });

export async function onRequestPost({ request, env }) {
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

  const message = String(body.message || "").trim();
  const email   = String(body.email || "").trim();
  const context = String(body.context || "").trim();
  if (!message) return bad("Escreve a mensagem.");
  for (const [k, v] of Object.entries({ message, email, context }))
    if (v.length > MAX[k]) return bad("Mensagem demasiado longa.");
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
