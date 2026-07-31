/* Site-only analytics helper for the faturas.diogoandrade.com PAGES - never the tool.
 * The tool (tool.js) runs inside the user's Financas session and by design sends nothing;
 * this file only ever loads on the marketing/info pages, where the Umami beacon already runs.
 * It fires one anonymous scroll-depth event per page when the reader passes 75% of the page.
 * No cookies, no PII: the event is just a name, no properties. Guarded so a missing/blocked
 * beacon is a silent no-op. Pure ASCII (same rule as tool.js). */
(function () {
  var fired = false;
  function onScroll() {
    if (fired) return;
    var h = document.documentElement, b = document.body;
    var top = h.scrollTop || b.scrollTop;
    var reach = (h.scrollHeight || b.scrollHeight) - h.clientHeight;
    if (reach > 200 && top / reach >= 0.75) {
      fired = true;
      try { if (window.umami) umami.track("scroll-75"); } catch (e) {}
      window.removeEventListener("scroll", onScroll);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
})();
