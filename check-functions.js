// Verify every function the tool CALLS is actually DEFINED.
// node --check cannot catch this - calling an undefined function is a RUNTIME error.
// That is exactly how a broken tool shipped to users.
const fs = require("fs");
let src = fs.readFileSync(process.argv[2], "utf8");

// definitions first, from the ORIGINAL source
const def = new Set();
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) def.add(m[1]);
for (const m of src.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function/g)) def.add(m[1]);

// then strip comments and string literals so prose like "browser (F12)" is not read as a call
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'\\])\/\/[^\n]*/g, "$1 ")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''");

const builtins = new Set(["if","for","while","switch","catch","return","typeof","function",
  "fetch","parseInt","parseFloat","alert","isNaN","String","Number","Boolean","Array","Object",
  "JSON","Math","Date","Promise","crypto","localStorage","document","window","console",
  "setTimeout","encodeURIComponent","decodeURIComponent","URLSearchParams","DOMParser",
  "TextEncoder","Uint8Array","require","btoa","atob"]);
const bad = new Set();
for (const m of code.matchAll(/(^|[^.\w$])([a-z][A-Za-z0-9_$]*)\s*\(/g)) {
  const n = m[2];
  if (!def.has(n) && !builtins.has(n)) bad.add(n);
}
console.log("  functions defined:", def.size);
console.log("  called but NOT defined:", bad.size ? [...bad].join(", ") : "NONE");
process.exit(bad.size ? 1 : 0);
