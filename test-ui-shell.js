const fs = require("fs");
const { JSDOM } = require("jsdom");

const pages = [
  "index.html",
  "perfil.html",
  "consulta.html",
  "contrato.html",
  "deducoes.html",
  "verificar.html",
  "sobre.html",
  "privacidade.html",
  "termos.html",
  "404.html"
];

let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log("  PASS " + message);
  } else {
    console.error("  FAIL " + message);
    failed++;
  }
}

const css = fs.readFileSync("assets/site.css", "utf8");
const cssDom = new JSDOM("<!DOCTYPE html><style>" + css + "</style>");
const sheet = cssDom.window.document.styleSheets[0];
check(Boolean(sheet), "shared stylesheet parses");
check(Boolean(sheet && sheet.cssRules.length > 100), "shared stylesheet contains the full component system");

pages.forEach(function (file) {
  const html = fs.readFileSync(file, "utf8");
  const dom = new JSDOM(html);
  const document = dom.window.document;

  console.log("\n" + file);
  check(Boolean(document.querySelector('link[href^="/assets/site.css"]')), "loads the shared design system");
  check(document.body.className.split(/\s+/).some(function (name) {
    return /^page-/.test(name);
  }), "declares a page-level design context");
  check(document.querySelectorAll("main#conteudo").length === 1, "has one main content landmark");
  check(Boolean(document.querySelector('.skip-link[href="#conteudo"]')), "has a keyboard skip link");

  const ids = Array.from(document.querySelectorAll("[id]")).map(function (node) { return node.id; });
  check(new Set(ids).size === ids.length, "has no duplicate static ids");

  const missingTargets = Array.from(document.querySelectorAll('a[href^="#"]'))
    .map(function (link) { return link.getAttribute("href"); })
    .filter(function (href) { return href && href !== "#"; })
    .filter(function (href) {
      try { return !document.querySelector(href); } catch (error) { return true; }
    });
  check(missingTargets.length === 0, "all static in-page links resolve");
});

if (failed) {
  console.error("\n" + failed + " UI shell check(s) failed.");
  process.exit(1);
}

console.log("\nUI shell checks passed.");
