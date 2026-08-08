// Fatura Boa extension service worker: the ONLY job is running the bundled tool.js in the
// e-Fatura tab when the bar asks for it. The tool runs in the content-script (isolated) world -
// same DOM, same-origin fetches as the page, immune to the page's CSP, and never touches the
// page's own JS. No remote code: tool.js ships inside this package (Web Store MV3 rule, and a
// stronger provably-fair story - the reviewed package IS the pinned code).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "fb-run" && sender.tab && sender.tab.id != null) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ["tool.js"],
    });
  }
});
