// Regenerate versions.json from the CURRENT tool.js. Run this BEFORE every deploy - a versions.json
// that does not match the served tool.js makes /verificar show MISMATCH for everyone (false alarm).
// The integrity is SRI format (sha384-<base64>), so it doubles as the value the pinned bookmarklet
// uses. Bump FB_VERSION in tool.js when the code changes; this reads it back out.
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
const buf = readFileSync("tool.js");
const integrity = "sha384-" + createHash("sha384").update(buf).digest("base64");
const version = (buf.toString().match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
const out = { current: version, files: { "tool.js": { version, integrity, bytes: buf.length } },
  note: "Provably-fair release manifest. Verify at /verificar; integrity is the SRI value the pinned bookmarklet uses." };
writeFileSync("versions.json", JSON.stringify(out, null, 2) + "\n");
console.log("versions.json ->", version, integrity, buf.length + "b");
