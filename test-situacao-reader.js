const { readFileSync } = require("fs");
const tool = readFileSync(process.argv[2] || "tool.js", "utf8");
const profile = readFileSync("perfil.html", "utf8");
function assert(ok, message) { if (!ok) throw new Error(message); }
const json = (tool.match(/function readError[\s\S]*?function getMaybe/) || [""])[0];
const situation = (tool.match(/function readSituacao\(\)[\s\S]*?\n  \}\n\n  \/\* IRS/) || [""])[0];
assert(/session_required/.test(json) && /empty_response/.test(json) && /invalid_json/.test(json),
  "official JSON errors are not distinguished");
assert(/unexpected_debts_shape/.test(situation), "unknown debt schema can still look complete");
assert(/coimas:\s*coi\s*\?/.test(situation) && /agenda:\s*agenda\s*\?/.test(situation),
  "optional tax-status failures are still converted to empty objects");
assert(/finesKnown/.test(profile) && /coimas por confirmar/.test(profile),
  "profile still turns an unread fines response into zero");
console.log("  tax-status reader distinguishes session, transport, schema and partial states");
