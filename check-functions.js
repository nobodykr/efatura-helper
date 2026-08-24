// Verify every function the tool CALLS is actually DEFINED.
// node --check cannot catch this - calling an undefined function is a RUNTIME error.
// That is exactly how a broken tool shipped to users.
const fs = require("fs");
let src = fs.readFileSync(process.argv[2], "utf8");

// definitions first, from the ORIGINAL source
const def = new Set();
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) def.add(m[1]);
for (const m of src.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function/g)) def.add(m[1]);

// Blank out comments, strings and regex literals so only real code is scanned. Prose like
// "Recibos verdes (atividade)" must not read as a call to atividade().
//
// WHY A SCANNER AND NOT REGEXES: chained .replace() passes cannot do this correctly, because each
// construct can contain the others' delimiters and whichever pass runs first desynchronises the
// rest. Three real failures, in order of discovery:
//   1. stripping "..." before '...' paired the inner quotes of single-quoted HTML
//      ('<div style="x">') ACROSS string boundaries -> UI copy exposed as calls;
//   2. regex literals were never stripped, so /\b(\d{9})\b/ read as a call to b();
//   3. stripping strings before regexes still broke, because a regex containing a quote (/["']/)
//      opens a phantom string that swallows everything after it.
// A single left-to-right scan with explicit state has none of these ambiguities.
function stripNonCode(s) {
  let out = "", i = 0;
  // A "/" starts a regex only where a value may begin; after an identifier, ")" or "]" it is division.
  const regexOk = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (/\s/.test(c)) continue;
      return !/[\w$)\].]/.test(c) || /\b(return|typeof|case|in|of|new|delete|void)$/.test(out.slice(0, k + 1));
    }
    return true; // start of file
  };
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "*") { const e = s.indexOf("*/", i + 2); i = e < 0 ? s.length : e + 2; out += " "; continue; }
    if (c === "/" && d === "/") { while (i < s.length && s[i] !== "\n") i++; out += " "; continue; }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < s.length && s[i] !== c) i += s[i] === "\\" ? 2 : 1;
      i++; out += '""'; continue;
    }
    if (c === "/" && regexOk()) {
      i++;
      let cls = false;
      while (i < s.length && (cls || s[i] !== "/") && s[i] !== "\n") {
        if (s[i] === "\\") { i += 2; continue; }
        if (s[i] === "[") cls = true; else if (s[i] === "]") cls = false;
        i++;
      }
      i++;
      while (i < s.length && /[gimsuy]/.test(s[i])) i++;
      out += " "; continue;
    }
    out += c; i++;
  }
  return out;
}
const noRe = stripNonCode(src);

const builtins = new Set(["if","for","while","switch","catch","return","typeof","function",
  "fetch","parseInt","parseFloat","alert","isNaN","String","Number","Boolean","Array","Object",
  "JSON","Math","Date","Promise","crypto","localStorage","document","window","console",
  "setTimeout","clearTimeout","setInterval","clearInterval","encodeURIComponent","decodeURIComponent","URLSearchParams","DOMParser",
  "TextEncoder","Uint8Array","require","btoa","atob",
  // lowercase-initial globals (the scan only flags /^[a-z]/, so Set/Map/Error need no entry)
  "isFinite","encodeURI","decodeURI","structuredClone","queueMicrotask","prompt","confirm",
  "escape","unescape","navigator","location","sessionStorage","performance"]);
const bad = new Set();
for (const m of noRe.matchAll(/(^|[^.\w$])([a-z][A-Za-z0-9_$]*)\s*\(/g)) {
  const n = m[2];
  if (!def.has(n) && !builtins.has(n)) bad.add(n);
}
console.log("  functions defined:", def.size);
console.log("  called but NOT defined:", bad.size ? [...bad].join(", ") : "NONE");
process.exit(bad.size ? 1 : 0);
