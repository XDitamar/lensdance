// node scripts/simulate-wheel.js [n]
// Runs the real server draw n times (default 100000) and prints observed odds.
const crypto = require("crypto");
const { PRIZES, TOTAL_WEIGHT, pickPrize } = require("../api/_prizes");
const n = Number(process.argv[2]) || 100000;
const counts = Object.fromEntries(PRIZES.map((p) => [p.id, 0]));
for (let i = 0; i < n; i++) counts[pickPrize(crypto.randomInt(TOTAL_WEIGHT)).id]++;
console.log(`${n} draws`);
for (const p of PRIZES) {
  const want = (p.weight / TOTAL_WEIGHT) * 100;
  const got = (counts[p.id] / n) * 100;
  console.log(`${p.id.padEnd(14)} ${p.tier.padEnd(8)} expected ${want.toFixed(2).padStart(6)}%  observed ${got.toFixed(2).padStart(6)}%  (${counts[p.id]})`);
}
