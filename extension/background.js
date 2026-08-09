// Fiscalidade extension service worker: run the bundled tool.js in the current State page when the
// bar asks. Two modes: default = the e-Fatura classifier; mode "profile" = the full-situacao read
// of the other partitions (rendas, situacao, atividade, IRS, movimentos, recibos, patrimonio,
// Seguranca Social) - identical to clicking the favorito on that page. The only difference is a
// window.__FB_PROFILE flag set (in the same isolated content-script world tool.js runs in) BEFORE
// tool.js executes, which is exactly the switch tool.js already reads. No remote code: tool.js
// ships inside this package (the reviewed bundle IS the pinned code).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "fb-run" || !sender.tab || sender.tab.id == null) return;
  const target = { tabId: sender.tab.id };
  const runTool = () => chrome.scripting.executeScript({ target, files: ["tool.js"] });
  if (msg.mode === "profile") {
    chrome.scripting
      .executeScript({ target, func: () => { window.__FB_PROFILE = 1; } })
      .then(runTool);
  } else {
    runTool();
  }
});
