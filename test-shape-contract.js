// Keep the two browser upload paths and the API allowlist on one exact set of stable endpoint IDs.
// URLs and account identifiers must never become aggregation keys.
const fs = require("fs");

const tool = fs.readFileSync("tool.js", "utf8");
const profile = fs.readFileSync("perfil.html", "utf8");
const contract = fs.readFileSync("profile-contract.js", "utf8");
const runtime = JSON.parse(fs.readFileSync("fiscalidade.config.json", "utf8"));
const browserContract = require("./profile-contract.js");

function between(source, start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`contract block missing: ${start}`);
  return source.slice(a, b);
}
function ids(source) {
  return [...source.matchAll(/"([a-z][a-z0-9.-]+\.v1)"/g)].map((m) => m[1]);
}
function exact(label, values, expected) {
  if (values.length !== new Set(values).size) throw new Error(`${label} contains duplicate endpoint IDs`);
  const got = [...new Set(values)].sort();
  const want = [...new Set(expected)].sort();
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label} endpoint IDs differ\n  got:  ${got.join(", ")}\n  want: ${want.join(", ")}`);
  }
}

const contractIds = ids(between(contract, "var ENDPOINT_RULES", "var IDS"));
exact("contract", contractIds, runtime.shapeEndpointIds);
if (!/PROFILE_CONTRACT\.partitions/.test(tool) || !/src="\/profile-contract\.js"/.test(profile))
  throw new Error("browser readers do not consume the shared profile contract");
const market = fs.readFileSync("market/storage.py", "utf8");
const marketIds = ids(between(market, "ENDPOINT_PARTITIONS = {", "}\nTOKEN"));
exact("isolated market service", marketIds, runtime.shapeEndpointIds);
if (!/endpoint not in ENDPOINT_PARTITIONS/.test(market) ||
    !/ENDPOINT_PARTITIONS\[endpoint\] != partition/.test(market) || !/_shape\(skeleton\)/.test(market))
  throw new Error("isolated intake does not revalidate stable endpoint IDs and strip values");
for (const value of contractIds) {
  if (/[0-9]{5,}/.test(value) || value.includes("/") || value.includes("?"))
    throw new Error(`unsafe endpoint ID: ${value}`);
}
if (browserContract.endpointId("/integrada/presentation") !== "activity.integrated.v1")
  throw new Error("integrated activity DOM route is not allowlisted");
if (browserContract.endpointId("/movfin/filtraMeusDocumentos.web") !== "finance.movements.v1")
  throw new Error("actual financial-movements HTML route is not allowlisted");
if (browserContract.endpointId("/app/dashboard-regime-simplificado") !== "activity.expenses.v1")
  throw new Error("activity-expenses HTML route is not allowlisted");

console.log("shared shape endpoint and isolated sink contract passed");
