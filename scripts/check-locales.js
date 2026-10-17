// node scripts/check-locales.js
// Fails (exit 1) unless he/en/ru/ar have exactly the same flattened keys.
const fs = require("fs");
const path = require("path");
const flat = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? flat(v, p + k + ".") : [p + k]);
const langs = ["he", "en", "ru", "ar"];
const keys = Object.fromEntries(langs.map((l) => [l,
  new Set(flat(JSON.parse(fs.readFileSync(path.join(__dirname, "../src/locales", l + ".json"), "utf8"))))]));
let bad = false;
for (const l of langs) {
  console.log(`${l}: ${keys[l].size} keys`);
  for (const other of langs) {
    if (other === l) continue;
    const missing = [...keys[other]].filter((k) => !keys[l].has(k));
    if (missing.length) { bad = true; console.log(`  ${l} is missing ${missing.length} from ${other}:`, missing.slice(0, 10)); }
  }
}
console.log(bad ? "PARITY: FAIL" : "PARITY: OK");
process.exit(bad ? 1 : 0);
