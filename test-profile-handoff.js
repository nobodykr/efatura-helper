const { JSDOM, VirtualConsole } = require("jsdom");
const { readFileSync } = require("fs");
const { webcrypto } = require("crypto");

const contractSource = readFileSync("profile-contract.js", "utf8");
const html = readFileSync("perfil.html", "utf8")
  .replace('<script src="/profile-contract.js"></script>', '<script>' + contractSource + '</script>');
const errors = [], fetches = [];
let fetchMode = "success";
const dom = new JSDOM(html, {
  url: "https://fiscalida.de/perfil", runScripts: "dangerously",
  virtualConsole: new VirtualConsole(),
  beforeParse(window) {
    Object.defineProperty(window, "crypto", { value: webcrypto });
    window.fetch = async (url, options={}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      fetches.push({ url:String(url), options, body });
      if (fetchMode !== "success")
        return { ok:false, status:503, json:async()=>({error:"internal_preview_not_configured"}) };
      return { ok:true, status:200, json:async()=>({ok:true, accepted:{
        shapes:Object.keys(body.shapes).length, companies:body.companies.length
      }}) };
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
    data:{ ano:2026, totalFaturas:1, porClassificar:0, atividades:{ C03:1 }, reAudit:[],
      buyerNif:"123456789", purchaseDate:"2026-08-25", invoiceId:"SECRET-DOC", issuerName:"SECRET ISSUER" },
    shapes:{ "efatura.documents.v1":{ linhas:[{
      valorTotal:"number", dataEmissaoDocumento:"2026-08-25", idDocumento:"SECRET-DOC",
      nomeEmitente:"SECRET ISSUER", nifAdquirente:"123456789"
    },"x1"] } },
    market:{ version:1, companies:[] }
  };
}
function assert(ok, message) { if (!ok) throw new Error(message); }
function wait(ms=40) { return new Promise((resolve) => setTimeout(resolve, ms)); }

(async function () {
  // Direct start: no /perfil button was clicked and there is no market agreement. The free flow
  // must not save, upload or count the source before the explicit exchange is accepted.
  const directId = "a".repeat(32);
  dispatch({ type:CONTRACT.helloType, contract:CONTRACT.version, partition:"efatura", requestId:directId });
  const directReady = replies.find((reply) => reply.message.type === CONTRACT.readyType && reply.message.requestId === directId);
  assert(directReady && /^[a-f0-9]{32}$/.test(directReady.message.nonce), "direct run did not bootstrap a nonce");
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:directId,
    nonce:directReady.message.nonce, envelope:envelope() });
  await wait();

  assert(dom.window.localStorage.getItem("fb-profile-v2") === null, "unagreed handoff stored the private profile");
  assert(fetches.length === 0, "unagreed handoff called the intake backend");
  assert(/0 de 13 fontes reunidas/.test(dom.window.document.body.textContent), "unagreed handoff advanced progress");
  assert(replies.some((reply) => reply.message.type === CONTRACT.rejectedType &&
    reply.message.requestId === directId && reply.message.code === "agreement_required"),
    "official source did not receive agreement_required");

  const agree = dom.window.document.getElementById("accept-market");
  assert(agree, "mandatory market agreement is not visible");
  agree.click();

  // After agreement, completion waits for a strict backend receipt. Sensitive envelope/data and
  // unexpected shape leaf values must not appear in the outgoing minimized payload.
  const acceptedId = "f".repeat(32);
  dispatch({ type:CONTRACT.helloType, contract:CONTRACT.version, partition:"efatura", requestId:acceptedId });
  const acceptedReady = replies.find((reply) => reply.message.type === CONTRACT.readyType && reply.message.requestId === acceptedId);
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:acceptedId,
    nonce:acceptedReady.message.nonce, envelope:envelope() });
  assert(/1 de 13 fontes lidas · a confirmar/.test(dom.window.document.body.textContent),
    "locally read source was not reflected immediately while intake was pending");
  await wait(80);

  let saved = JSON.parse(dom.window.localStorage.getItem("fb-profile-v2"));
  assert(saved.partitions.efatura.status === "done", "accepted intake did not complete the source");
  assert(saved.partitions.efatura.intake.status === "accepted", "intake receipt was not stored");
  assert(fetches.length === 1, "accepted handoff did not make exactly one intake request");
  const payload = fetches[0].body;
  assert(JSON.stringify(Object.keys(payload).sort()) === JSON.stringify([
    "agreement","companies","contract","partition","shapes","submissionToken"
  ]), "intake payload contains unknown top-level fields");
  assert(payload.partition === "efatura" && payload.companies.length === 0,
    "unexpected e-Fatura payload structure");
  const encodedPayload = JSON.stringify(payload);
  for (const secret of ["123456789","2026-08-25","SECRET-DOC","SECRET ISSUER"])
    assert(!encodedPayload.includes(secret), `sensitive value escaped in intake payload: ${secret}`);
  assert(payload.shapes["efatura.documents.v1"].linhas[0].dataEmissaoDocumento === "string" &&
    payload.shapes["efatura.documents.v1"].linhas[0].idDocumento === "string",
    "shape leaves were not sanitized before transmission");
  assert(/1 de 13 fontes reunidas/.test(dom.window.document.body.textContent), "profile UI did not advance after receipt");
  assert(replies.some((reply) => reply.message.type === CONTRACT.acceptedType &&
    reply.message.requestId === acceptedId && reply.message.intake === "required"),
    "official source did not receive required-intake completion");

  // Replay is consumed: it cannot write/accept the same envelope twice.
  const acceptedBeforeReplay = replies.filter((reply) => reply.message.type === CONTRACT.acceptedType).length;
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:acceptedId,
    nonce:acceptedReady.message.nonce, envelope:envelope() });
  await wait(10);
  assert(replies.filter((reply) => reply.message.type === CONTRACT.acceptedType).length === acceptedBeforeReplay,
    "replayed envelope was accepted");

  // A backend outage puts the source back into pending, reports failure to the official tab and
  // offers a retry that uses the already-local reading. It must never count a failed receipt.
  fetchMode = "failure";
  const failedId = "9".repeat(32);
  dispatch({ type:CONTRACT.helloType, contract:CONTRACT.version, partition:"efatura", requestId:failedId });
  const failedReady = replies.find((reply) => reply.message.type === CONTRACT.readyType && reply.message.requestId === failedId);
  dispatch({ type:CONTRACT.messageType, partition:"efatura", requestId:failedId,
    nonce:failedReady.message.nonce, envelope:envelope() });
  await wait(80);
  saved = JSON.parse(dom.window.localStorage.getItem("fb-profile-v2"));
  assert(saved.partitions.efatura.status === "pending" && saved.partitions.efatura.intake.code === "intake_unavailable",
    "failed intake incorrectly completed the source");
  assert(/1 de 13 fontes lidas · a confirmar/.test(dom.window.document.body.textContent),
    "failed intake hid the already-local reading instead of exposing its pending state");
  assert(replies.some((reply) => reply.message.type === CONTRACT.rejectedType &&
    reply.message.requestId === failedId && reply.message.code === "intake_unavailable"),
    "official source did not receive intake failure");
  const retry = dom.window.document.getElementById("retry-intake");
  assert(retry, "failed intake did not expose a local retry");
  fetchMode = "success";
  retry.click();
  await wait(80);
  saved = JSON.parse(dom.window.localStorage.getItem("fb-profile-v2"));
  assert(saved.partitions.efatura.status === "done" && saved.partitions.efatura.intake.status === "accepted",
    "retry did not complete after a valid receipt");

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
  console.log("  mandatory minimized intake gates completion; PII/date values, failures, wrong origin and replay stay contained");
  dom.window.close(); official.close(); attacker.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
