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
const html = fs.readFileSync(FILE, "utf8");
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
};

function render(profile) {
  return new Promise((resolve) => {
    const errors = [];
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "https://fiscalida.de/perfil",
      beforeParse(w) {
        w.fetch = () => Promise.reject(new Error("offline no teste"));
        w.localStorage.setItem("fb-profile-v1", JSON.stringify(profile));
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
  console.log(failures ? `\n  ${failures} FAILED` : "\n  all render tests passed");
  process.exit(failures ? 1 : 0);
})();
