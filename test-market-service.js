const { spawnSync } = require("child_process");
const result = spawnSync("python3", ["-m", "unittest", "market.test_storage"], { encoding: "utf8" });
if (result.status !== 0) {
  console.error((result.stdout || "") + (result.stderr || ""));
  process.exit(result.status || 1);
}
console.log("  isolated market intake validation, dedupe and k-threshold passed");
