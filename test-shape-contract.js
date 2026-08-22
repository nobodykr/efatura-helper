// Keep the two browser upload paths and the API allowlist on one exact set of stable endpoint IDs.
// URLs and account identifiers must never become aggregation keys.
const fs = require("fs");

const tool = fs.readFileSync("tool.js", "utf8");
const profile = fs.readFileSync("perfil.html", "utf8");
const runtime = JSON.parse(fs.readFileSync("fiscalidade.config.json", "utf8"));

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

const toolIds = ids(between(tool, "function shapeEndpointId", "function contributeProfileShapes"));
const profileIds = ids(between(profile, "function endpointId", "function sendShare"));

exact("tool", toolIds, runtime.shapeEndpointIds);
exact("profile", profileIds, toolIds);
if (fs.existsSync("../cae-db/fiscalidade_api.py")) {
  const api = fs.readFileSync("../cae-db/fiscalidade_api.py", "utf8");
  const apiIds = ids(between(api, "ENDPOINT_IDS = frozenset({", "})"));
  exact("API", apiIds, toolIds);
}
for (const value of toolIds) {
  if (/[0-9]{5,}/.test(value) || value.includes("/") || value.includes("?"))
    throw new Error(`unsafe endpoint ID: ${value}`);
}

console.log("shape contribution endpoint contract passed");
