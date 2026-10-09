// SMOKE TEST DE RENDER - corre perfil.html a serio, com perfis reais, e falha se a pagina ficar em
// branco ou se algum erro escapar.
//
// PORQUE EXISTE: em 2026-07-25 foi para producao uma pagina que nao renderizava NADA para quem tinha
// dados (ReferenceError: rendasVal is not defined). O unico check antes do deploy era
// `new Function(src)`, que valida SINTAXE e nao apanha um erro de runtime num caminho que so corre
// quando existe perfil guardado. Este teste corre o render com varios perfis e apanha exatamente isso.
//
//   node test-render.js [perfil.html]
const { JSDOM } = require("jsdom");
const fs = require("fs");

const FILE = process.argv[2] || "perfil.html";
const contract = fs.readFileSync("profile-contract.js", "utf8");
const html = fs.readFileSync(FILE, "utf8").replace('<script src="/profile-contract.js"></script>', '<script>' + contract + '</script>');
let failures = 0;
function ok(name, cond, extra) {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond || !extra ? "" : " -> " + extra));
  if (!cond) failures++;
}

// Perfis representativos: vazio, so e-Fatura, e o caso completo (rendas + declaracoes + liquidacao),
// que e onde o bug vivia.
const anoPassado = new Date().getFullYear() - 1;
const PROFILES = {
  "vazio": { partitions: {} },
  "so e-Fatura": { partitions: {
    efatura: { status: "done", data: { ano: anoPassado + 1, totalFaturas: 100, porClassificar: 3, atividades: {}, reAudit: [] } },
  } },
  "completo (rendas + liquidacao)": { partitions: {
    efatura: { status: "done", data: { ano: anoPassado + 1, totalFaturas: 535, porClassificar: 0, atividades: {}, uid: "deadbeef",
      reAudit: [{ ano: anoPassado, recuperavel: 714, nMover: 155, porSetor: { "Saúde": 97 },
                  recuperavelAconselhado: 120, nMoverAconselhado: 8, porSetorAconselhado: { "Saúde": 8 },
                  nDeGerais: 12, totalFaturas: 535 }] } },
    rendas: { status: "done", data: { contratos: 1, activos: 1, recibos: 17,
      rendasPorAno: { [anoPassado]: { n: 8, valor: 4075 } } } },
    recibos: { status: "done", data: { recibosVerdes: 0, declaracoes: { [anoPassado]: {
      n: 2, substituida: true, tipo: "2. D.PRAZO", situacao: "SALDO NULO EMITIDO", montante: "0,00",
      numLiquidacao: "2026 500 0000000", liquidacao: { marginal: 44.6, taxaEfetiva: 25.45 } } } } },
    irs: { status: "done", data: { liquidacoes: 3, porAno: [{ ano: anoPassado }] } },
    patrimonio: { status: "done", data: { imoveis: 1 } },
  } },
  // COM o detalhe por comerciante (porComerciante), que e o que reAuditAno passou a devolver. Mais
  // de 8 grupos para exercitar o caminho do <details> "Ver mais N", e uma linha SEM `de` para o
  // caso de um perfil parcialmente preenchido. Os fixtures acima ficam de proposito SEM
  // porComerciante: sao a cobertura do caminho de ausencia (perfis guardados por versoes antigas).
  "com detalhe por comerciante": { partitions: {
    efatura: { status: "done", data: { ano: anoPassado + 1, totalFaturas: 300, porClassificar: 0, atividades: {},
      reAudit: [{ ano: anoPassado, recuperavel: 651.4, nMover: 153, porSetor: { "Saúde": 74 },
        recuperavelAconselhado: 214.8, nMoverAconselhado: 46, porSetorAconselhado: { "Saúde": 31 },
        nDeGerais: 88, totalFaturas: 300,
        porComerciante: Array.from({ length: 11 }, (_, i) => ({
          nome: "Comerciante " + i, nif: String(500000001 + i), n: 11 - i,
          valor: +(120 - i * 9.5).toFixed(2), de: i === 3 ? "" : "Outros", para: "Saúde" })),
        porComercianteAconselhado: [
          { nome: "Farmácia Teste", nif: "500000001", n: 9, valor: 118.42, de: "Outros", para: "Saúde" }] }] } },
    irs: { status: "done", data: { liquidacoes: 2, porAno: [{ ano: anoPassado }] } },
  } },
  // sem rendas, mas com declaracoes: garante que o bloco das rendas nao rebenta quando nao ha Cat F
  "sem rendas, com IRS": { partitions: {
    efatura: { status: "done", data: { ano: anoPassado + 1, totalFaturas: 10, porClassificar: 0, atividades: {}, reAudit: [
      { ano: anoPassado, recuperavel: 0, nMover: 0, porSetor: {}, recuperavelAconselhado: 0, nMoverAconselhado: 0, porSetorAconselhado: {} }] } },
    irs: { status: "done", data: { liquidacoes: 2, porAno: [{ ano: anoPassado }] } },
  } },
  // VPT: the Portal sends integer cents; tool.js stores euros in `vptEur`. A profile saved by an older
  // version holds only the raw `vpt` (cents) and must not show it as euros.
  "património com VPT": { partitions: {
    patrimonio: { status: "done", data: { imoveis: 2, lista: [
      { artigo: "1227", freguesia: "Exemplo", tipo: "U", vptEur: 84341.72 },
      { artigo: "99", freguesia: "Antiga", tipo: "U", vpt: 8434172 }] } },
  } },
  // Despesas de atividade read for every selector year: the latest on top, the others listed, an
  // unknown label of an earlier year and a year that could not be read stay visible.
  "despesas de atividade por ano": { partitions: {
    despesas_atividade: { status: "done", data: { ano: 2025, nota: "x",
      categorias: { "Despesas com pessoal": { valor: 100, considerar: 100, reconhecida: true, detalhes: [] } },
      porAno: {
        "2025": { ano: 2025, categorias: { "Despesas com pessoal": { valor: 100, considerar: 100, reconhecida: true, detalhes: [] } } },
        "2024": { ano: 2024, categorias: { "Despesas novas": { valor: 5, considerar: 5, reconhecida: false, detalhes: [] } },
          avisos: ["Despesas de atividade: categoria não reconhecida «Despesas novas». Confirme no Portal das Finanças."] },
        "2023": { ano: 2023, categorias: {}, vazio: true } },
      anosNaoLidos: [2022] } },
  } },
  "atividade futura, ainda não aberta": { partitions: {
    atividade: { status: "done", data: { declaracoes: 2, cessada: null,
      ultimaDeclaracaoTipo: "inicio-ou-reinicio", ultimaDeclaracaoAceite: true,
      avisos: ["data efetiva por confirmar"] } },
    atividade_integrada: { status: "done", data: { estadoAtual: "agendada", cessada: null,
      inicio: null, proximoInicio: "2099-01-01", inicios: ["2099-01-01"], cessacoes: [] } },
  } },
};

function render(profile) {
  return new Promise((resolve) => {
    const errors = [];
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "https://fiscalida.de/perfil",
      beforeParse(w) {
        w.fetch = () => Promise.reject(new Error("offline no teste"));
        w.localStorage.setItem("fb-profile-v2", JSON.stringify(profile));
        w.localStorage.setItem("fiscalidade-market-agreement-v1", JSON.stringify({ version:"market-v1", accepted:true }));
        w.addEventListener("error", (e) => errors.push(String(e.message || e)));
      },
    });
    const onErr = (e) => errors.push(String((e && e.message) || e));
    process.on("uncaughtException", onErr);
    setTimeout(() => {
      process.removeListener("uncaughtException", onErr);
      const out = dom.window.document.getElementById("out");
      resolve({ html: out ? out.innerHTML : "", errors });
      dom.window.close();
    }, 600);
  });
}

(async () => {
  for (const [nome, prof] of Object.entries(PROFILES)) {
    const r = await render(prof);
    ok(`[${nome}] rendeu conteudo (nao ficou em branco)`, r.html.length > 200, r.html.length + " chars");
    ok(`[${nome}] sem erros de runtime`, r.errors.length === 0, r.errors.join(" | ").slice(0, 120));
  }
  // o caso completo tem de trazer as abas, mas a recomendacao de rendas fica desligada enquanto o
  // modelo anual e o parser de demonstracoes nao tiverem fixtures independentes.
  const full = await render(PROFILES["completo (rendas + liquidacao)"]);
  ok("abas Otimizado/Aconselhado presentes", /class="fbtab"/.test(full.html));
  ok("comparacao de rendas esta explicitamente desativada",
     /Comparação de rendas desativada/.test(full.html) && /não recomenda englobamento/.test(full.html));
  const vpt = await render(PROFILES["património com VPT"]);
  ok("VPT em euros, formato PT-PT", /VPT 84(&nbsp;|\u00a0)341,72(&nbsp;|\u00a0)€/.test(vpt.html), (vpt.html.match(/VPT[^<]{0,30}/) || [""])[0]);
  ok("VPT antigo em cêntimos não aparece como euros", !/8434172|8(&nbsp;|\u00a0)434(&nbsp;|\u00a0)172/.test(vpt.html));
  const despesas = await render(PROFILES["despesas de atividade por ano"]);
  ok("despesas de atividade: anos lidos, aviso de ano anterior e ano não lido visíveis",
    /Anos lidos: 2025, 2024, 2023 \(sem despesas\)/.test(despesas.html) && /2024: Despesas de atividade: categoria não reconhecida/.test(despesas.html) &&
    /não lidas para 2022/.test(despesas.html), (despesas.html.match(/Anos lidos[^<]{0,80}/) || [""])[0]);
  const scheduled = await render(PROFILES["atividade futura, ainda não aberta"]);
  ok("atividade futura não ativa Cat. B nem Anexo B",
    !/Cat\. B\b/.test(scheduled.html) && !/IRS - Anexo B/.test(scheduled.html));
  ok("atividade futura aparece como agendada",
    /agendado|futuro/i.test(scheduled.html));
  console.log(failures ? `\n  ${failures} FAILED` : "\n  all render tests passed");
  process.exit(failures ? 1 : 0);
})();
