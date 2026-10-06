// Aggregate runner for the audit kit: runs every correctness check an external auditor can
// reproduce with `npm test`. Each test-*.js is a standalone Node script that loads a source file
// into JSDOM and asserts on it. Most take tool.js as argv[2]; a few assert on perfil.html; one
// (test-network) needs a real browser. A missing browser is a failure by default: the suite must
// never report "all green" when its strongest privacy check did not execute. Local unit-only runs
// may explicitly set FISCALIDADE_ALLOW_BROWSER_SKIP=1 and are labelled incomplete.
import { readdirSync } from "fs";
import { spawnSync } from "child_process";

const PERFIL = new Set(["test-deadlines.js", "test-obligations.js", "test-render.js"]); // assert on perfil.html
const BROWSER = new Set(["test-bookmarklet-browser.js", "test-network.js"]); // needs Playwright/chromium

// favorito-dev.html is a gitignored build output that two checks read, and it pins tool.js by SRI,
// so a copy left from an earlier FB_VERSION is as wrong as a missing one. Rebuild it on every run.
const build = spawnSync("node", ["build-bookmarklet-dev.mjs"], { encoding: "utf8" });
if (build.status !== 0) {
  console.log("  FAIL build-bookmarklet-dev.mjs (favorito-dev.html could not be generated; run `npm run build:dev` to see why)");
  const lines = ((build.stdout || "") + (build.stderr || "")).trim().split("\n");
  const why = lines.filter((l) => /^\w*Error\b/.test(l));
  console.log((why.length ? why : lines.slice(-6)).map((l) => "       " + l).join("\n"));
  process.exit(1);
}

const tests = readdirSync(".").filter((f) => /^test-.*\.js$/.test(f)).sort();
const checks = tests.map((t) => ({
  name: t,
  cmd: ["node", t, PERFIL.has(t) ? "perfil.html" : "tool.js"],
  browser: BROWSER.has(t),
}));
checks.push({ name: "check-functions.js", cmd: ["node", "check-functions.js", "tool.js"] });

const fails = [];
let skipped = 0;
const allowBrowserSkip = process.env.FISCALIDADE_ALLOW_BROWSER_SKIP === "1";
for (const c of checks) {
  const r = spawnSync(c.cmd[0], c.cmd.slice(1), { encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === 0;
  if (ok) {
    console.log("  ok   " + c.name);
  } else if (c.browser && allowBrowserSkip && /chromium|playwright|executable doesn't exist/i.test(out)) {
    console.log("  skip " + c.name + "  (needs a browser: npx playwright-core install chromium)");
    skipped++;
  } else {
    console.log("  FAIL " + c.name);
    fails.push(c.name);
    console.log(out.trim().split("\n").slice(-6).map((l) => "       " + l).join("\n"));
  }
}
const suffix = fails.length ? " -> " + fails.join(", ") : skipped ? " - INCOMPLETE (browser check skipped)" : " - all green";
console.log(`\n${checks.length} checks: ${checks.length - fails.length - skipped} ok, ${skipped} skipped, ${fails.length} failed${suffix}`);
process.exit(fails.length ? 1 : 0);
