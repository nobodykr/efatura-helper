// Aggregate runner for the audit kit: runs every correctness check an external auditor can
// reproduce with `npm test`. Each test-*.js is a standalone Node script that loads a source file
// into JSDOM and asserts on it. Most take tool.js as argv[2]; a few assert on perfil.html; one
// (test-network) needs a real browser (Playwright/chromium) and is SKIPPED - not failed - when
// chromium isn't installed, so a plain `npm install && npm test` still runs the full node/jsdom
// suite. Also runs check-functions.js (the "every called function is defined" guard).
// Exit non-zero only on a genuine failure.
import { readdirSync } from "fs";
import { spawnSync } from "child_process";

const PERFIL = new Set(["test-deadlines.js", "test-obligations.js", "test-render.js"]); // assert on perfil.html
const BROWSER = new Set(["test-network.js"]); // needs Playwright/chromium

const tests = readdirSync(".").filter((f) => /^test-.*\.js$/.test(f)).sort();
const checks = tests.map((t) => ({
  name: t,
  cmd: ["node", t, PERFIL.has(t) ? "perfil.html" : "tool.js"],
  browser: BROWSER.has(t),
}));
checks.push({ name: "check-functions.js", cmd: ["node", "check-functions.js", "tool.js"] });

const fails = [];
let skipped = 0;
for (const c of checks) {
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === 0;
  if (ok) {
    console.log("  ok   " + c.name);
  } else if (c.browser && /chromium|playwright|executable doesn't exist/i.test(out)) {
    console.log("  skip " + c.name + "  (needs a browser: npx playwright install chromium)");
    skipped++;
  } else {
    console.log("  FAIL " + c.name);
    fails.push(c.name);
    console.log(out.trim().split("\n").slice(-6).map((l) => "       " + l).join("\n"));
  }
}
console.log(
  `\n${checks.length} checks: ${checks.length - fails.length - skipped} ok, ${skipped} skipped, ${fails.length} failed` +
    (fails.length ? " -> " + fails.join(", ") : " - all green")
);
process.exit(fails.length ? 1 : 0);
