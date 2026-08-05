// Regenerate versions.json from the CURRENT tool.js. Run this BEFORE every deploy - a versions.json
// that does not match the served tool.js makes /verificar show MISMATCH for everyone (false alarm).
// The integrity is SRI format (sha384-<base64>), so it doubles as the value the pinned bookmarklet
// uses. Bump FB_VERSION in tool.js when the code changes; this reads it back out.
//
// Provenance for auditors (/verificar, /auditoria): point at the last commit that changed tool.js.
// This avoids both failure modes of a hand-written release tag: a tag that was never published, and
// a mutable branch URL. It is not circular because the commit only has to contain this exact
// tool.js; versions.json may be generated later. If tool.js has uncommitted changes, refuse to
// publish a manifest rather than attaching their hash to the previous commit.
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
const buf = readFileSync("tool.js");
const integrity = "sha384-" + createHash("sha384").update(buf).digest("base64");
const version = (buf.toString().match(/FB_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "unknown";
const repo = "https://github.com/nobodykr/efatura-helper";
// Against HEAD, not the index: a plain `git diff` only sees UNSTAGED edits, so `git add tool.js`
// followed by a release silently attached the new bytes' hash to the previous commit - precisely
// the failure this guard is here to prevent.
const dirty = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "tool.js"], { encoding: "utf8" }).trim();
if (dirty) throw new Error("tool.js tem alteracoes por commitar; cria primeiro o commit de release");
const sourceCommit = execFileSync("git", ["log", "-1", "--format=%H", "--", "tool.js"],
  { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("nao foi possivel resolver o commit de tool.js");
const out = {
  current: version,
  repo,
  source_commit: sourceCommit,
  source: `${repo}/blob/${sourceCommit}/tool.js`,
  files: { "tool.js": { version, integrity, bytes: buf.length } },
  note: "Provably-fair release manifest. The served tool.js must hash to `integrity` (verify at /verificar); `source_commit` is the immutable Git commit containing that exact file.",
};
writeFileSync("versions.json", JSON.stringify(out, null, 2) + "\n");
console.log("versions.json ->", version, sourceCommit.slice(0, 12), integrity, buf.length + "b");
