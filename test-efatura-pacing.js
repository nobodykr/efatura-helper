// e-Fatura pacing (Jotty fat-fb-reaudit-429). The AT answers http-429 above about two requests per
// 15 s (measured 07/10/2026, Bible ch. 15), and the past-year re-audit used to fetch its three years
// in parallel and drop the ones that failed without a word. Runs the real tool.js profiling read of
// e-Fatura and proves:
//   1. every obterDocumentosAdquirente request waits the 8 s gap after the previous answer;
//   2. a 429 is retried after 15 s and then 30 s, and a year still failing is not used at all;
//   3. the past years go one at a time; the failed year is listed in reAuditFalhados with its
//      reason and attempts, the years that answered stay in reAudit, and the panel says it in PT-PT;
//   4. without the test-only time scale (the public bookmarklet and the extension) the gap is real.
// Pauses run at SCALE (__FISCALIDADE_CONFIG__.efaturaTimeScale) so the suite does not wait minutes.
//   node test-efatura-pacing.js tool.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const SRC = fs.readFileSync(process.argv[2] || "tool.js", "utf8");
const CONTRACT = require("./profile-contract.js");
const SCALE = 0.01;
const Y = new Date().getFullYear();
let failures = 0;
function ok(name, cond, extra) {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond || !extra ? "" : " -> " + extra));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function json(o) {
  return Promise.resolve({ ok: true, status: 200, headers: { get: () => "application/json" },
    text: () => Promise.resolve(JSON.stringify(o)), json: () => Promise.resolve(o) });
}
function tooMany() {
  return Promise.resolve({ ok: false, status: 429,
    headers: { get: (h) => (/content-type/i.test(h) ? "application/json" : null) }, text: () => Promise.resolve("{}") });
}

function env(config, fetchImpl) {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "https://faturas.portaldasfinancas.gov.pt/x" });
  const w = dom.window;
  global.window = w; global.document = w.document; global.location = w.location;
  global.navigator = w.navigator; global.DOMParser = w.DOMParser; global.alert = () => {};
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; } };
  w.localStorage = global.localStorage;
  global.FISCALIDADE_PROFILE_CONTRACT = CONTRACT; w.FISCALIDADE_PROFILE_CONTRACT = CONTRACT;
  w.__FB_PROFILE = 1;
  w.__FISCALIDADE_CONFIG__ = Object.assign({ channel: "dev-bookmarklet", remoteCodeAllowed: false }, config);
  // A /perfil window that answers the v3 handshake and accepts, as in test-profiling.js.
  const target = { closed: false, location: { href: "https://fiscalida.de/perfil" }, focus() {},
    postMessage(message) {
      const reply = (data) => setTimeout(() => w.dispatchEvent(new w.MessageEvent("message",
        { origin: "https://fiscalida.de", source: target, data: data })), 0);
      if (message.type === CONTRACT.helloType)
        reply({ type: CONTRACT.readyType, partition: message.partition, requestId: message.requestId, nonce: "f".repeat(32) });
      if (message.type === CONTRACT.messageType)
        reply({ type: CONTRACT.acceptedType, partition: message.partition, requestId: message.requestId, intake: "required" });
    } };
  w.open = () => target;
  w.__FISCALIDADE_PROFILE_TARGET__ = target;
  global.fetch = fetchImpl;
  return w;
}

(async () => {
  // Current year and Y-3 answer; Y-1 answers 429 once, then 200; Y-2 answers 429 every time.
  const calls = [];
  const seen = {};
  const fetchImpl = (u) => {
    const s = String(u);
    if (/obterDocumentosAdquirente/.test(s)) {
      const y = Number((s.match(/dataInicioFilter=(\d{4})/) || [])[1]);
      seen[y] = (seen[y] || 0) + 1;
      calls.push({ y: y, at: Date.now() });
      if (y === Y - 2 || (y === Y - 1 && seen[y] === 1)) return tooMany();
      return json({ totalElementos: 1, linhas: [{ estadoBeneficio: "R", actividadeEmitente: "C99", nifEmitente: "500000009",
        valorTotal: 1000, valorTotalIva: 230 }] });
    }
    return json({});
  };
  const w = env({ efaturaTimeScale: SCALE }, fetchImpl);
  eval(SRC);
  let store = null;
  for (let i = 0; i < 100 && !(store && store.partitions && store.partitions.efatura); i++) {
    await wait(50);
    store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "null");
  }
  await wait(200);
  const data = store && store.partitions && store.partitions.efatura && store.partitions.efatura.data;
  ok("e-Fatura read completes and is stored", !!data);

  const years = calls.map((c) => c.y);
  ok("years go one at a time, in order, with the retries in place",
    JSON.stringify(years) === JSON.stringify([Y, Y - 1, Y - 1, Y - 2, Y - 2, Y - 2, Y - 3]), years.join(","));
  const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
  // 8 s between requests; after a 429, 15 s then 30 s (all at SCALE, minus timer jitter).
  const want = [8000, 15000, 8000, 15000, 30000, 8000].map((ms) => ms * SCALE - 15);
  ok("every request waits the gap after the previous answer, a 429 waits 15 s then 30 s",
    gaps.length === want.length && gaps.every((g, i) => g >= want[i]), gaps.join(", ") + " ms");

  ok("the year that answered after one 429 is used",
    !!data && data.reAudit.some((r) => r.ano === Y - 1) && data.reAudit.some((r) => r.ano === Y - 3));
  ok("the year that kept answering 429 is not used",
    !!data && !data.reAudit.some((r) => r.ano === Y - 2));
  ok("the missing year is listed with its reason and attempts",
    !!data && JSON.stringify(data.reAuditFalhados) === JSON.stringify([{ ano: Y - 2, motivo: "limite_pedidos", tentativas: 3 }]),
    data && JSON.stringify(data.reAuditFalhados));
  const panel = (w.document.getElementById("efh-body") || {}).textContent || "";
  ok("the panel says in PT-PT that the year could not be read",
    panel.indexOf("Não foi possível ler as faturas de " + (Y - 2) + ": o Portal das Finanças limitou os pedidos (3 tentativas)") >= 0,
    panel.slice(0, 200));

  // The public default: no time scale (or an out-of-range one) keeps the real 8 s gap.
  const real = [];
  env({ efaturaTimeScale: 5 }, (u) => {
    if (/obterDocumentosAdquirente/.test(String(u))) real.push(Date.now());
    return json(/obterDocumentosAdquirente/.test(String(u)) ? { totalElementos: 0, linhas: [] } : {});
  });
  eval(SRC);
  await wait(1500);
  ok("without the test time scale the second request is not sent within 1.5 s", real.length === 1, real.length + " requests");

  console.log(failures ? `\n  ${failures} FAILED` : "\n  e-Fatura requests are paced and a missing year is said");
  process.exit(failures ? 1 : 0);
})();
