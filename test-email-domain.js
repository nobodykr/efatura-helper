import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("functions/api/feedback.js", "utf8");

assert.match(source, /env\.RESEND_FROM \|\| "Fiscalidade <faturas@send\.fiscalida\.de>"/);
assert.match(source, /email \|\| env\.RESEND_REPLY_TO \|\| "faturas@fiscalida\.de"/);

console.log("email identity uses the Fiscalidade sending domain and reply alias");
