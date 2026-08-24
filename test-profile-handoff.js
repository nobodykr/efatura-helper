const { JSDOM, VirtualConsole } = require("jsdom");
const { readFileSync } = require("fs");
const { webcrypto } = require("crypto");

const contractSource = readFileSync("profile-contract.js", "utf8");
const html = readFileSync("perfil.html", "utf8")
  .replace('<script src="/profile-contract.js"></script>', '<script>' + contractSource + '</script>');
const errors = [], fetches = [];
const dom = new JSDOM(html, {
  url: "https://fiscalida.de/perfil", runScripts: "dangerously",
  virtualConsole: new VirtualConsole(),
  beforeParse(window) {
    Object.defineProperty(window, "crypto", { value: webcrypto });
    window.fetch = async (url) => {
      fetches.push(url);
      return { ok:false, status:503, json:async()=>({error:"internal_preview_not_configured"}) };
    };
    window.addEventListener("error", (event) => errors.push(event.message));
  }
});
const CONTRACT = dom.window.FISCALIDADE_PROFILE_CONTRACT;
const official = new JSDOM("", { url:"https://faturas.portaldasfinancas.gov.pt/x" }).window;
const attacker = new JSDOM("", { url:"https://example.net/x" }).window;
const replies = [];
official.postMessage = (message, origin) => replies.push({ message, origin });
attacker.postMessage = (message, origin) => replies.push({ message, origin, attacker:true });

function dispatch(data, options={}) {
  data = dom.window.JSON.parse(JSON.stringify(data));
  dom.window.dispatchEvent(new dom.window.MessageEvent("message", {
    origin:options.origin || "https://faturas.portaldasfinancas.gov.pt",
    source:options.source || official, data
  }));
}
function envelope() {
  return {
    contract:CONTRACT.version, partition:"efatura", status:"done",
    capturedAt:new Date().toISOString(),
    data:{ ano:2026, totalFaturas:1, porClassificar:0, atividades:{ C03:1 }, reAudit:[] },
    shapes:{ "efatura.documents.v1":{ linhas:[{ valorTotal:"number" },"x1"] } },
    market:{ version:1, companies:[] }
  };
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function wait(ms=40) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async function () {
  // Direct start: no /perfil button was clicked and there is no market agreement.
  const directId = "a".repeat(32);
  dispatch({ type:CONTRACT.helloType, contract:CONTRACT.version, partition:"efatura", requestId:directId });
  const directReady = replies.find((reply) => reply.message.type === CONTRACT.readyType && reply.message.requestId === directId);
  assert(directReady && /^[a-f0-9]{32}$/.test(directReady.message.nonce), "direct run did not bootstrap a nonce");
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:directId,
    nonce:directReady.message.nonce, envelope:envelope() });
  await wait();

  const saved = JSON.parse(dom.window.localStorage.getItem("fb-profile-v2"));
  assert(saved.partitions.efatura.status === "done", "direct handoff did not complete locally");
  assert(saved.partitions.efatura.intake.status === "disabled", "disabled intake state is not explicit");
  assert(fetches.length === 0, "disabled market intake still called the backend");
  assert(/1 de 13 fontes reunidas/.test(dom.window.document.body.textContent), "profile UI did not advance from 0/13 to 1/13");
  assert(replies.some((reply) => reply.message.type === CONTRACT.acceptedType && reply.message.requestId === directId),
    "official source did not receive local completion");

  // Replay is consumed: it cannot write/accept the same envelope twice.
  const acceptedBeforeReplay = replies.filter((reply) => reply.message.type === CONTRACT.acceptedType).length;
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:directId,
    nonce:directReady.message.nonce, envelope:envelope() });
  await wait(10);
  assert(replies.filter((reply) => reply.message.type === CONTRACT.acceptedType).length === acceptedBeforeReplay,
    "replayed envelope was accepted");

  // Guided start: /perfil has already chosen the partition+nonce; first hello binds request+source.
  dom.window.localStorage.setItem("fiscalidade-active-intake-v3", JSON.stringify({
    partition:"efatura", nonce:"b".repeat(32), expiresAt:Date.now()+60000
  }));
  const guidedId = "c".repeat(32);
  dispatch({ type:CONTRACT.helloType, contract:CONTRACT.version, partition:"efatura", requestId:guidedId });
  const guidedReady = replies.find((reply) => reply.message.type === CONTRACT.readyType && reply.message.requestId === guidedId);
  assert(guidedReady && guidedReady.message.nonce === "b".repeat(32), "guided nonce was not preserved and bound");

  // Wrong nonce is rejected and does not replace the already-complete local row.
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:guidedId,
    nonce:"d".repeat(32), envelope:envelope() });
  assert(replies.some((reply) => reply.message.type === CONTRACT.rejectedType && reply.message.requestId === guidedId),
    "wrong nonce was not rejected");

  // Wrong origin cannot obtain a ready nonce, even with a syntactically valid request.
  const readyBeforeAttack = replies.filter((reply) => reply.message.type === CONTRACT.readyType).length;
  dispatch({ type:CONTRACT.helloType, contract:CONTRACT.version, partition:"efatura", requestId:"e".repeat(32) },
    { origin:"https://example.net", source:attacker });
  assert(replies.filter((reply) => reply.message.type === CONTRACT.readyType).length === readyBeforeAttack,
    "unofficial origin obtained a nonce");

  assert(errors.length === 0, "profile handoff raised: " + errors.join(" | "));
  console.log("  direct and guided v3 handoff completes locally; backend, wrong origin and replay cannot block/corrupt it");
  dom.window.close(); official.close(); attacker.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
