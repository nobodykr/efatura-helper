// Data check for cirs_atividades.json, the published CAE / CIRS reference table. The first harvest
// merged the AT modal's two tabs into one dict (cae and cirs were the same object) and 17 CAE
// classes carried the label of the CIRS code with the same four digits. This pins the split.
// Labels are checked against a pinned copy of INE SMI CAE Rev.4 (fixtures/, version 5497), so
// the test needs no other repository. Whitespace is compared collapsed: Rev.4 writes one label
// (74110 / 7411) with a no-break space where the AT list has a plain space.
//   node test-cirs-atividades.js
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("cirs_atividades.json", "utf8"));
const rev4 = JSON.parse(fs.readFileSync("fixtures/cae_rev4_levels_4_5.json", "utf8"));
let failures = 0;
function ok(name, cond, extra) {
  console.log((cond ? "  PASS " : "  FAIL ") + name + (cond || !extra ? "" : " -> " + extra));
  if (!cond) failures++;
}
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const cae = data.cae || {}, cirs = data.cirs || {};
const five = Object.keys(cae).filter((k) => /^\d{5}$/.test(k));
const four = Object.keys(cae).filter((k) => /^\d{4}$/.test(k));

ok("pinned Rev.4 copy is SMI version 5497 with 651 classes and 915 subclasses",
  rev4.version_id === 5497 && Object.keys(rev4.level4).length === 651 && Object.keys(rev4.level5).length === 915);
ok("cae and cirs are two separate lists", cae !== cirs && JSON.stringify(cae) !== JSON.stringify(cirs));
ok("every cae key is a 4- or 5-digit code", five.length + four.length === Object.keys(cae).length);
const badFive = five.filter((k) => !(k in rev4.level5) || norm(rev4.level5[k]) !== norm(cae[k]));
ok("cae five-digit codes are Rev.4 subclasses with identical labels (" + five.length + ")",
  five.length > 0 && badFive.length === 0, badFive.slice(0, 5).join(", "));
const badFour = four.filter((k) => !(k in rev4.level4) || norm(rev4.level4[k]) !== norm(cae[k]));
ok("cae four-digit codes are Rev.4 classes with identical labels (" + four.length + ")",
  four.length > 0 && badFour.length === 0, badFour.slice(0, 5).join(", "));
ok("cirs has exactly the 90 art. 151 codes", Object.keys(cirs).length === 90 &&
  Object.keys(cirs).every((k) => /^\d{4}$/.test(k)));
const shared = Object.keys(cirs).filter((k) => k in cae);
ok("a code in both lists never shares its label (" + shared.length + " shared codes)",
  shared.every((k) => norm(cae[k]) !== norm(cirs[k])), shared.filter((k) => norm(cae[k]) === norm(cirs[k])).slice(0, 10).join(", "));
const caeLabels = new Set(Object.values(cae).map(norm));
const crossed = Object.keys(cirs).filter((k) => caeLabels.has(norm(cirs[k])));
ok("no CIRS label appears in the CAE list", crossed.length === 0, crossed.slice(0, 10).join(", "));
// The INE label of 8412 carries an en dash. A dash sweep once wrote it as a hyphen in both files, and
// the label comparison above still passed because the pinned copy was swept too. Both files are
// listed in .sem-tracos-dados so the dash hook leaves them verbatim.
ok("CAE 8412 keeps the official en dash in the table and in the pinned Rev.4 copy",
  /^Administra\u00e7\u00e3o P\u00fablica \u2013 atividades/.test(cae["8412"] || "") &&
  /^Administra\u00e7\u00e3o P\u00fablica \u2013 atividades/.test(rev4.level4["8412"] || ""));
ok("metadata says what each list is", /cirs/i.test(data._nota) && /151/.test(data._nota) && /Rev\.4/.test(data._nota) &&
  !/fetched live|lido pela ferramenta/i.test(data._nota));

console.log(failures ? "\n  " + failures + " FAILED" : "\n  all passed");
process.exit(failures ? 1 : 0);
