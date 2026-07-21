// The learning loop must send THREE fields and nothing else, and must stay silent unless the
// user ticked the share box. A privacy promise that only holds by convention rots; this pins it.
//   npm i jsdom && node test-outcome.js tool.js
const { JSDOM } = require("jsdom"); const fs = require("fs");
const rows = [
  { estadoBeneficio: "P", nifEmitente: "500960046", nomeEmitente: "Loja A", valorTotal: 10000,
    valorTotalIva: 600, dataEmissaoDocumento: "2026-06-01", idDocumento: "p1" },
  { estadoBeneficio: "P", nifEmitente: "503540480", nomeEmitente: "Loja B", valorTotal: 5000,
    valorTotalIva: 300, dataEmissaoDocumento: "2026-06-02", idDocumento: "p2" }
];
const ALLOWED = ["nif", "suggested", "chosen"];
// anything that could identify the user or reconstruct their spending
const FORBIDDEN = ["valor", "total", "iva", "data", "date", "amount", "idDocumento", "nifAdquirente",
                   "email", "nome", "merchant", "atcud", "doc"];

function run(share) {
  const posted = [];
  const dom = new JSDOM("<!doctype html><body></body>",
    { url: "https://faturas.portaldasfinancas.gov.pt/x" });
  const { window } = dom;
  global.window = window; global.document = window.document; global.location = window.location;
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; },
                          setItem(k, v) { this._d[k] = String(v); } };
  window.localStorage = global.localStorage;
  global.crypto = { getRandomValues: a => a, subtle: {} };
  global.TextEncoder = require("util").TextEncoder;
  global.DOMParser = window.DOMParser; global.alert = () => {};
  global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
  window.document.execCommand = () => true;
  global.fetch = (u, o) => {
    const s = String(u);
    if (/\/outcome$/.test(s)) posted.push(JSON.parse((o || {}).body || "{}"));
    if (s.includes("sectors.json"))
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        { "500960046": ["C05", "C99"], "503540480": ["C03", "C99"] }) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ linhas: rows }),
                             text: () => Promise.resolve("") });
  };
  global.localStorage.setItem("efh-consent-v1", JSON.stringify({ ok: true, share: share }));
  eval(fs.readFileSync(process.argv[2] || __dirname + "/tool.js", "utf8"));
  return new Promise(res => setTimeout(() => {
    const btn = window.document.getElementById("efh-export");
    if (btn) btn.onclick();
    setTimeout(() => res(posted), 120);
  }, 500));
}

(async () => {
  const off = await run(false);
  console.log("  share OFF -> requests sent:", off.length, off.length === 0 ? "(correct)" : "*** LEAK ***");

  const on = await run(true);
  console.log("  share ON  -> requests sent:", on.length);
  const keys = [...new Set(on.flatMap(o => Object.keys(o)))];
  console.log("  fields sent:", keys.join(", ") || "(none)");
  const onlyAllowed = keys.every(k => ALLOWED.includes(k));
  const noForbidden = !keys.some(k => FORBIDDEN.some(f => k.toLowerCase().includes(f.toLowerCase())));
  const sectorsOk = on.every(o => /^C[0-9]{2}$/.test(o.suggested) && /^C[0-9]{2}$/.test(o.chosen));
  const nifIsMerchant = on.every(o => rows.some(r => r.nifEmitente === o.nif));
  console.log("  only the three allowed fields:", onlyAllowed);
  console.log("  no amount/date/identity field:", noForbidden);
  console.log("  sectors well-formed:", sectorsOk);
  console.log("  nif is the MERCHANT's, not the user's:", nifIsMerchant);

  const pass = off.length === 0 && on.length > 0 && onlyAllowed && noForbidden && sectorsOk && nifIsMerchant;
  console.log(pass ? "  PASS" : "  *** FAIL: the learning loop sends more than it promises ***");
  if (!pass) process.exit(1);
})();
