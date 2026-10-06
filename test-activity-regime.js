// IVA regime, end to end, per regime class. For each class a real-shaped (synthetic) signed
// "Atividade Exercida" screen goes through the actual tool.js reader, the envelope it hands to
// /perfil is stored the way /perfil stores it, and the actual perfil.html is rendered from it:
//   fixture -> stored profile (official text verbatim + class) -> rendered text -> obligation.
// Also: an OPEN activity without Enquadramento leaves the step incomplete with a visible
// "Regime de IVA nao lido" and a retry, and nowhere produces the generic "salvo isencao" line.
//   node test-activity-regime.js tool.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const { ecraAtividade } = require("./fixtures/ecra-atividade.js");
const SRC = fs.readFileSync(process.argv[2] || "tool.js", "utf8");
const CONTRACT = require("./profile-contract.js");
const CONTRACT_SRC = fs.readFileSync("profile-contract.js", "utf8");
const PERFIL = fs.readFileSync("perfil.html", "utf8")
  .replace('<script src="/profile-contract.js"></script>', "<script>" + CONTRACT_SRC + "</script>");
let failures = 0;
function ok(name, cond, extra) {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond || !extra ? "" : " -> " + extra));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms || 900));
const GENERIC = /salvo isen/i;
const SIGNED = "/integrada/presentation?targetScreen=ecraActividade&hmac=fixture";

// The official tab of the signed screen, with the gated bookmarklet flag and a /perfil window that
// answers the v3 handshake and records the envelope it receives.
function officialTab(bodyHtml) {
  const host = "sitfiscal.portaldasfinancas.gov.pt";
  const dom = new JSDOM("<!doctype html><body>" + bodyHtml + "</body>", { url: "https://" + host + SIGNED });
  const { window } = dom;
  let href = "https://" + host + SIGNED;
  const loc = { host: host, hash: "", pathname: "/integrada/presentation", origin: "https://" + host };
  Object.defineProperty(loc, "href", { get() { return href; }, set(v) { href = String(v); } });
  global.window = window; global.document = window.document; global.location = loc;
  global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  window.localStorage = global.localStorage;
  global.alert = () => {}; global.navigator = window.navigator; global.DOMParser = window.DOMParser;
  global.fetch = () => Promise.reject(new Error("the signed screen is read from the DOM, not fetched"));
  global.FISCALIDADE_PROFILE_CONTRACT = CONTRACT; window.FISCALIDADE_PROFILE_CONTRACT = CONTRACT;
  window.__handoffs = [];
  const target = new JSDOM("", { url: "https://fiscalida.de/perfil" }).window;
  const reply = (data) => setTimeout(() => window.dispatchEvent(new window.MessageEvent("message",
    { origin: "https://fiscalida.de", source: target, data: data })), 0);
  target.postMessage = function (m) {
    if (m.type === CONTRACT.helloType) reply({ type: CONTRACT.readyType, partition: m.partition, requestId: m.requestId, nonce: "f".repeat(32) });
    if (m.type === CONTRACT.messageType) {
      window.__handoffs.push(m.envelope);
      reply({ type: CONTRACT.acceptedType, partition: m.partition, requestId: m.requestId, intake: "required" });
    }
  };
  window.open = () => target;
  window.__FISCALIDADE_PROFILE_TARGET__ = target;
  window.__FB_PROFILE = 1;
  window.__FISCALIDADE_CONFIG__ = { channel: "dev-bookmarklet", remoteCodeAllowed: false };
  return { window, loc };
}

// perfil.html rendered from a store, with the "Outras situacoes" gate confirmed so the obligations
// list ("O que tens de tratar") is part of the page.
function renderPerfil(store) {
  return new Promise((resolve) => {
    const errors = [];
    const dom = new JSDOM(PERFIL, {
      runScripts: "dangerously", url: "https://fiscalida.de/perfil",
      beforeParse(w) {
        w.fetch = () => Promise.reject(new Error("offline no teste"));
        w.localStorage.setItem("fb-profile-v2", JSON.stringify(store));
        w.localStorage.setItem("fiscalidade-market-agreement-v1", JSON.stringify({ version: "market-v1", accepted: true }));
        w.localStorage.setItem("fb-profile-extra-confirmed", "1");
        w.addEventListener("error", (e) => errors.push(String(e.message || e)));
      }
    });
    setTimeout(() => {
      const out = dom.window.document.getElementById("out");
      resolve({ text: out ? out.textContent.replace(/\s+/g, " ") : "", errors: errors });
      dom.window.close();
    }, 600);
  });
}

// Synthetic Enquadramento texts. They are NOT copies of any account's official wording; they only
// exercise each class. Each must come back character for character.
const CASES = [
  { classe: "isento_art53", iva: "Isento ao abrigo do artigo 53.º (texto sintético)", titulo: "IVA - isento (art. 53.º CIVA)", diz: /isenção do art\. 53\.º/ },
  { classe: "isento_art9", iva: "Isento ao abrigo do artigo 9.º (texto sintético)", titulo: "IVA - isento (art. 9.º CIVA)", diz: /art\. 9\.º pela natureza da atividade/ },
  { classe: "normal_mensal", iva: "Normal Mensal (texto sintético)", titulo: "IVA - declaração periódica mensal", diz: /de cada mês/ },
  { classe: "normal_trimestral", iva: "Normal Trimestral (texto sintético)", titulo: "IVA - declaração periódica trimestral", diz: /de cada trimestre/ },
  { classe: "outro", iva: "Pequenos retalhistas (texto sintético)", titulo: "IVA - confirmar a obrigação", diz: /confirma a obrigação de IVA/ }
];

(async () => {
  // Classifier sanity on the contract itself (the one implementation tool.js and /perfil share).
  ok("contract lists exactly the five regime classes",
    JSON.stringify(CONTRACT.ivaRegimeClasses) === JSON.stringify(CASES.map((c) => c.classe)));
  ok("classifier: empty text has no class", CONTRACT.ivaRegimeClass("") === null && CONTRACT.ivaRegimeClass(null) === null);
  ok("classifier: art. 53 and art. 9 are different exemptions",
    CONTRACT.ivaRegimeClass("isento art. 53") === "isento_art53" && CONTRACT.ivaRegimeClass("isento art. 9") === "isento_art9");

  for (const c of CASES) {
    const tag = "[" + c.classe + "] ";
    const irs = "Simplificado (texto sintético " + c.classe + ")";
    // Whitespace around the official text is trimmed; nothing else changes.
    const { window } = officialTab(ecraAtividade({ iva: "\n   " + c.iva + "  ", irs: irs }));
    eval(SRC); await wait();
    const store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
    const row = store.partitions && store.partitions.atividade_integrada;
    const data = (row && row.data) || {};
    ok(tag + "step done", row && row.status === "done", row && row.error);
    ok(tag + "official IVA text stored verbatim (trimmed)", data.enquadramentoIva === c.iva, JSON.stringify(data.enquadramentoIva));
    ok(tag + "class stored next to it", data.enquadramentoIvaClasse === c.classe, data.enquadramentoIvaClasse);
    ok(tag + "official IRS text stored verbatim", data.enquadramentoIrs === irs, JSON.stringify(data.enquadramentoIrs));
    ok(tag + "activity is open", data.estadoAtual === "aberta");
    ok(tag + "legacy guessed key is gone", !("regimeIva" in data));
    const env = window.__handoffs.find((h) => h.partition === "atividade_integrada");
    ok(tag + "handoff carries the same text and class", !!env && env.data.enquadramentoIva === c.iva && env.data.enquadramentoIvaClasse === c.classe);
    if (c.classe === "isento_art53") {
      // The other dt/dd fields of the real layout, read from their own <dd> (no label bleed).
      ok(tag + "tipoSujeito read from its own <dd>", data.tipoSujeito === "SUJEITO PASSIVO SINTETICO", JSON.stringify(data.tipoSujeito));
      ok(tag + "contabilidade read", data.contabilidade === "Não organizada", JSON.stringify(data.contabilidade));
      ok(tag + "empty Motivo de Cessacao is not filled with the next label", Array.isArray(data.motivosCessacao) && data.motivosCessacao.length === 0, JSON.stringify(data.motivosCessacao));
      ok(tag + "codigos from the Tipo/Codigo/Descricao table",
        JSON.stringify((data.codigos || []).map((x) => [x.tipo, x.codigo, x.desc, x.desde])) === JSON.stringify([
          ["CIRS Principal", "0001", "DESCRICAO SINTETICA A", "2001-01-01"],
          ["CAE Secundário 1", "00002", "DESCRICAO SINTETICA B", "2001-01-01"],
          ["CAE Secundário 2", "00003", "DESCRICAO SINTETICA C", "2001-01-01"]]), JSON.stringify(data.codigos));
    }

    // /perfil: the envelope as acceptEnvelope + accepted intake store it.
    const page = await renderPerfil({ partitions: { atividade_integrada: { status: "done", fetchedAt: new Date().toISOString(), data: env ? env.data : data, intake: { status: "accepted" } } } });
    ok(tag + "perfil renders without runtime errors", page.errors.length === 0, page.errors.join(" | ").slice(0, 160));
    ok(tag + "perfil shows the official IVA text exactly", page.text.includes(c.iva), page.text.slice(0, 200));
    ok(tag + "'O que ja sabemos' row carries the official text", page.text.includes("Atividade aberta - IVA: " + c.iva));
    ok(tag + "obligation title follows the class", page.text.includes(c.titulo));
    ok(tag + "obligation quotes the official text", page.text.includes('Enquadramento em IVA na AT: "' + c.iva + '"'));
    ok(tag + "obligation wording for the class", c.diz.test(page.text));
    ok(tag + "no generic 'salvo isencao' line", !GENERIC.test(page.text));
  }

  // Open activity, Enquadramento empty: the step is NOT done, the message is visible, retry goes
  // back to the hub, nothing is handed to /perfil.
  {
    const { window, loc } = officialTab(ecraAtividade({ iva: null, irs: "Simplificado (texto sintético)" }));
    eval(SRC); await wait();
    const store = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}");
    const row = store.partitions && store.partitions.atividade_integrada;
    const body = window.document.getElementById("efh-body").textContent;
    ok("[sem Enquadramento] step left incomplete", !!row && row.status === "pending" && row.code === "regime_iva_nao_lido", JSON.stringify(row));
    ok("[sem Enquadramento] visible 'Regime de IVA nao lido'", /Regime de IVA não lido/.test(body), body.slice(0, 200));
    ok("[sem Enquadramento] nothing handed to /perfil", window.__handoffs.length === 0);
    ok("[sem Enquadramento] no generic line on the official tab", !GENERIC.test(body));
    const retry = window.document.getElementById("fb-retry");
    ok("[sem Enquadramento] retry offered", !!retry);
    if (retry) retry.onclick();
    ok("[sem Enquadramento] retry returns to the hub for a fresh signed screen",
      loc.href === CONTRACT.partition("atividade_integrada").open, loc.href);
  }

  // A cessada or agendada activity without Enquadramento is a stated unknown, not a failure.
  {
    officialTab(ecraAtividade({ iva: null, irs: null, inicio: "2001-01-01", cessacao: "2002-01-01", tipoSujeito: "" }));
    eval(SRC); await wait();
    const row = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}").partitions.atividade_integrada;
    ok("[cessada] completes without a regime", row && row.status === "done" && row.data.estadoAtual === "cessada" && row.data.enquadramentoIva === null);
    ok("[cessada] an empty <dd> stays null instead of taking the next panel title", row && row.data.tipoSujeito === null, JSON.stringify(row && row.data.tipoSujeito));
  }

  // The IVA panel's dated sub-regimes (Reembolso Mensal, IVA de Caixa, ...) have their own
  // Data de Inicio. A filled one after the cessation is not a restart: the activity stays cessada.
  {
    officialTab(ecraAtividade({ iva: null, irs: null, inicio: "2001-01-01", cessacao: "2002-01-01",
      regimes: { caixa: { inicio: "2003-01-01" } } }));
    eval(SRC); await wait();
    const row = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}").partitions.atividade_integrada;
    const d = (row && row.data) || {};
    ok("[cessada + IVA de caixa] stays cessada", row && row.status === "done" && d.estadoAtual === "cessada" && d.cessada === true, JSON.stringify(row));
    ok("[cessada + IVA de caixa] start is the first panel's own date", d.inicio === "2001-01-01" &&
      JSON.stringify(d.inicios) === JSON.stringify(["2001-01-01"]), JSON.stringify(d.inicios));
    ok("[cessada + IVA de caixa] cessations from the IVA and IRS panels", d.cessacao === "2002-01-01" &&
      JSON.stringify(d.cessacoes) === JSON.stringify(["2002-01-01"]), JSON.stringify(d.cessacoes));
  }

  // Every sub-regime filled, one in the future, on an open activity: no extra start and no
  // scheduled restart.
  {
    officialTab(ecraAtividade({ iva: "Normal Trimestral (texto sintético)", irs: null, inicio: "2001-01-01",
      regimes: { reembolso: { inicio: "2004-01-01", fim: "2005-01-01" }, caixa: { inicio: "2099-01-01" },
                 omitido4: { inicio: "2006-01-01" }, omitido5: { inicio: "2007-01-01", fim: "2008-01-01" } } }));
    eval(SRC); await wait();
    const row = JSON.parse(global.localStorage.getItem("fb-profile-v1") || "{}").partitions.atividade_integrada;
    const d = (row && row.data) || {};
    ok("[aberta + sub-regimes] open, start from the first panel only", row && row.status === "done" &&
      d.estadoAtual === "aberta" && d.inicio === "2001-01-01" && JSON.stringify(d.inicios) === JSON.stringify(["2001-01-01"]), JSON.stringify(d.inicios));
    ok("[aberta + sub-regimes] a future sub-regime start is not a scheduled restart", d.proximoInicio === null, d.proximoInicio);
  }

  // /perfil with a row from an OLDER reader (open, done, no Enquadramento): visible message, never
  // the generic line. And with the screen not offered (disponivel:false) plus Cat. B from recibos:
  // a stated unknown, never the generic line either.
  {
    const legacy = await renderPerfil({ partitions: { atividade_integrada: { status: "done", data: { estadoAtual: "aberta", cessada: false, inicio: "2001-01-01" }, intake: { status: "accepted" } } } });
    ok("[perfil, leitor antigo] shows 'Regime de IVA nao lido'", /Regime de IVA não lido/.test(legacy.text));
    ok("[perfil, leitor antigo] no generic line", !GENERIC.test(legacy.text));
    const unknown = await renderPerfil({ partitions: {
      atividade_integrada: { status: "done", data: { disponivel: false }, intake: { status: "accepted" } },
      recibos: { status: "done", data: { recibosVerdes: 2 }, intake: { status: "accepted" } } } });
    ok("[perfil, ecra nao exposto] stated unknown", /IVA - regime por confirmar/.test(unknown.text) && /não disponibilizou o ecrã Atividade exercida/.test(unknown.text));
    ok("[perfil, ecra nao exposto] no generic line", !GENERIC.test(unknown.text));
  }

  console.log(failures ? "\n  " + failures + " FAILED" : "\n  all passed");
  process.exit(failures ? 1 : 0);
})();
