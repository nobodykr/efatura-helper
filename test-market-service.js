const { spawnSync } = require("child_process");
const { readFileSync } = require("fs");
const result = spawnSync("python3", ["-m", "unittest", "market.test_storage"], { encoding: "utf8" });
if (result.status !== 0) {
  console.error((result.stdout || "") + (result.stderr || ""));
  process.exit(result.status || 1);
}
const app = readFileSync("market/app.py", "utf8");
const compose = readFileSync("market/docker-compose.yml", "utf8");
const facade = readFileSync("functions/api/v1/[[path]].js", "utf8");
if (!/compare_digest/.test(app) || !/body_too_large/.test(app) ||
    !/x-fiscalidade-market-key/.test(app + facade))
  throw new Error("isolated market service is missing its own credential or body boundary");
if (!/read_only:\s*true/.test(compose) || !/cap_drop:\s*\[ALL\]/.test(compose) ||
    !/cloudflared@sha256:/.test(compose) || /cae-db|FISCALIDADE_API_ORIGIN/.test(compose))
  throw new Error("market deployment is not hardened and isolated from cae-db");
console.log("  isolated market intake validation, dedupe and k-threshold passed");
