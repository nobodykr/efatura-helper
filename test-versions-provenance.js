// versions.json must prove the exact immutable tool.js bytes, not point at a missing release tag.
const fs = require("fs");
const crypto = require("crypto");

let fails = 0;
const bad = (m) => { console.log("  FAIL " + m); fails++; };
const ok = (m) => console.log("  ok   " + m);

const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const current = versions;
const tool = versions.files && versions.files["tool.js"];
const bytes = fs.readFileSync("tool.js");
const sha384 = "sha384-" + crypto.createHash("sha384").update(bytes).digest("base64");

if (!/^[0-9a-f]{40}$/.test(current.source_commit || "")) bad("source_commit nao e um SHA-1 Git completo");
if (!tool) bad("manifesto nao tem files[tool.js]");
else {
  if (tool.bytes !== bytes.length) bad(`bytes publicados ${tool.bytes}, reais ${bytes.length}`);
  if (tool.integrity !== sha384) bad("sha384 publicado nao corresponde a tool.js");
}
const expected = `https://github.com/nobodykr/efatura-helper/blob/${current.source_commit}/tool.js`;
if (current.source !== expected) bad(`fonte nao e o blob imutavel esperado: ${current.source}`);
if (/\/releases\/tag\//.test(JSON.stringify(versions))) bad("proveniencia ainda depende de uma tag de release");
if (!fails) ok("bytes, SHA-384 e blob Git imutavel apontam para a mesma tool.js");

const generator = fs.readFileSync("make-versions.mjs", "utf8");
if (!/git[\s\S]*log/.test(generator) || !/source_commit/.test(generator))
  bad("make-versions.mjs nao deriva a origem do historico Git");
if (!/diff[\s\S]*tool\.js/.test(generator)) bad("o gerador nao recusa tool.js por commitar");
else ok("gerador prende a versao ao ultimo commit que alterou tool.js");

console.log(fails ? `\n  ${fails} FALHA(S) de proveniencia`
                  : "\n  proveniencia verificavel e imutavel");
process.exit(fails ? 1 : 0);
