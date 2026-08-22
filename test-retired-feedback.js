const { existsSync, readFileSync } = require("fs");

if (existsSync("functions/api/feedback.js"))
  throw new Error("PII-capable free-text feedback endpoint must stay retired during internal review");
for (const file of ["index.html", "sobre.html", "privacidade.html"]) {
  const source = readFileSync(file, "utf8");
  if (/\/api\/feedback|cf-turnstile|challenges\.cloudflare\.com/.test(source))
    throw new Error(`${file} still exposes the retired feedback/widget flow`);
}
console.log("retired free-text feedback surface remains absent");
