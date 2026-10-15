// Every PNG and SVG we hand out (OG card, icons, logos, store and outreach screenshots, and the extension
// icons when a build has rendered them) must carry only allowlisted metadata, checked with the shared
// checker vendored in docs/tooling (canonical copy: homelab-infra tools/export_metadata, never edit
// the vendored file).
const { execFileSync } = require("child_process");
const { createHash } = require("crypto");
const { readFileSync, readdirSync, existsSync } = require("fs");
const path = require("path");

const CHECKER = path.join(__dirname, "docs", "tooling", "export_metadata.py");
const CHECKER_SHA256 = "fba9dc7d0ecedd5161422240649ce5b15bf195bbeccb29c674d89025e5dc0806";
const SKIP = new Set(["node_modules", "dist", ".git", ".wrangler", "market"]);

function assert(ok, message) { if (!ok) throw new Error(message); }

function images(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...images(full));
    else if (/\.(png|svg)$/.test(entry.name)) found.push(full);
  }
  return found.sort();
}

assert(createHash("sha256").update(readFileSync(CHECKER)).digest("hex") === CHECKER_SHA256, "vendored export_metadata.py differs from the pinned canonical copy");

const files = images(__dirname);
assert(["apple-icon.png", "assets/og.png", "icon.svg", "assets/revolut-appicon.svg"].every((f) => files.includes(path.join(__dirname, f))), "OG card, icon or logo missing");
if (existsSync(path.join(__dirname, "extension", "icon128.png"))) {
  assert(files.includes(path.join(__dirname, "extension", "icon128.png")), "extension icons not picked up");
}

// The checker exits 1 and prints "FAIL path" plus "- problem" lines on findings.
try {
  execFileSync("python3", ["-B", CHECKER, "check", ...files], { encoding: "utf8" });
} catch (error) {
  throw new Error("Image metadata findings:\n" + String(error.stdout || error));
}
console.log("  " + files.length + " PNG and SVG files carry only allowlisted metadata");
