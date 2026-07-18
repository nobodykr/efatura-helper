// Rewrites tool.js escaping every non-ASCII char to \uXXXX, keeping it encoding-proof.
// Run after editing tool.js:  node escape-tool.js
const fs = require("fs");
const src = fs.readFileSync("tool.js", "utf8");
let n = 0;
const out = [...src].map(c => c.charCodeAt(0) < 128 ? c : (n++, "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))).join("");
fs.writeFileSync("tool.js", out);
console.log(`escaped ${n} non-ASCII chars ,  tool.js is pure ASCII`);
