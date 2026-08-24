// The packaged reader must not duplicate profile data in an official site's storage or in the
// extension service worker. It hands one versioned envelope directly to canonical /perfil.
const { readFileSync } = require("fs");
const tool = readFileSync(process.argv[2] || "tool.js", "utf8");
const background = readFileSync("extension/background.js", "utf8");

function assert(ok, message) { if (!ok) throw new Error(message); }
const storage = (tool.match(/function profLoad\(\)[\s\S]*?function profSave\(p\)[\s\S]*?\n  \}/) || [""])[0];
assert(/if \(EXTENSION_MODE\) return _extensionProfile/.test(storage), "extension reader can read official-origin profile storage");
assert(/if \(EXTENSION_MODE\) \{[^}]*_extensionProfile = p; return; \}/.test(storage), "extension reader can write official-origin profile storage");
assert(/fiscalidade-profile-envelope-v3/.test(readFileSync("profile-contract.js", "utf8")), "versioned browser envelope missing");
assert(/target\.postMessage\([\s\S]*contract\.messageType/.test(tool), "reader does not hand the envelope to canonical /perfil");
assert(!/fb-profile-save/.test(tool + background), "retired extension-owned profile handoff survived");
assert(!/contributeProfileShapes/.test(tool), "reader still has a duplicate optional shape upload");
assert(/marketCompanyYear/.test(tool) && /isVerifiedLegalEntityNif\(nif\)/.test(tool),
  "e-Fatura market aggregate is not restricted to verified legal entities");
console.log("  extension tool uses one browser-only canonical profile handoff");
