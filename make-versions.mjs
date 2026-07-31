// Regenerate versions.json from the CURRENT tool.js. Run this BEFORE every deploy - a versions.json
// that does not match the served tool.js makes /verificar show MISMATCH for everyone (false alarm).
// The integrity is SRI format (sha384-<base64>), so it doubles as the value the pinned bookmarklet
// uses. Bump FB_VERSION in tool.js when the code changes; this reads it back out.
//
// Provenance for auditors (/verificar, /auditoria): we record the git TAG and repo, NOT a commit
// hash. The release commit is the one that CONTAINS this versions.json, so its own hash cannot be
// embedded here (circular). The tag `v<version>` is created on that release commit and is the stable,
// deterministic anchor: it resolves on GitHub to the exact tool.js that produced this integrity.
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
const buf = readFileSync("tool.js");
const integrity = "sha384-" + createHash("sha384").update(buf).digest("base64");
const version = (buf.toString().match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
const repo = "https://github.com/nobodykr/efatura-helper";
const tag = version === "unknown" ? "unknown" : "v" + version;
const out = {
  current: version,
  tag,
  repo,
  source: version === "unknown" ? repo : `${repo}/blob/${tag}/tool.js`,
  files: { "tool.js": { version, integrity, bytes: buf.length } },
  note: "Provably-fair release manifest. The served tool.js must hash to `integrity` (verify at /verificar); `tag` resolves on GitHub to the exact source that produced it.",
};
writeFileSync("versions.json", JSON.stringify(out, null, 2) + "\n");
console.log("versions.json ->", version, tag, integrity, buf.length + "b");
