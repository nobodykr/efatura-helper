const { readFileSync, existsSync } = require("fs");
function assert(ok, message) { if (!ok) throw new Error(message); }
const stable = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const dev = JSON.parse(readFileSync("extension/manifest.dev.json", "utf8"));
const build = readFileSync("extension/build.mjs", "utf8");
assert(stable.name === "Fatura Boa" && stable.version === "0.8.0.3" && stable.version_name === "0.8.2", "stable production identity/version missing");
assert(dev.name === "Fatura Boa DEV" && dev.version === "0.8.0.5" && dev.version_name === "0.8.0-dev.6", "DEV identity/version missing");
assert(/--channel=dev/.test(build) && /dev\/\$\{releaseName\}/.test(build), "separate DEV build output missing");
assert(["invoices.html","invoices.css","invoices.js"].every((file) => existsSync("extension/" + file) && build.includes("'" + file + "'")), "dashboard files missing from package allowlist");
assert(["brand.css","fonts.css"].every((file) => build.includes("'" + file + "'")) && /fontFiles/.test(build), "canonical brand assets missing from package allowlist");
assert(build.includes("'profile-contract.js'") && /copyFileSync\(root\('profile-contract\.js'\)/.test(build), "shared profile contract missing from package");
assert(/IBM Plex Sans/.test(readFileSync("extension/brand.css", "utf8")) && /fonts\.css/.test(readFileSync("extension/invoices.html", "utf8")) && /fonts\.css/.test(readFileSync("extension/profile.html", "utf8")), "Fiscalidade brand typography is not shared by extension pages");
assert(!/#A855F7|#FF4FD8/i.test(build + readFileSync("extension/brand.css", "utf8")), "old purple DEV branding survived");
assert(!/cae-db/.test(build + readFileSync("extension/invoices.js", "utf8")), "DEV build introduced a cae-db deployment dependency");
console.log("  separate DEV build contract passed");
