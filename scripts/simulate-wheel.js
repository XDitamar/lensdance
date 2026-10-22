// node scripts/simulate-wheel.js [n]
// Runs the REAL draw (drawPrize in functions/lib/wheel.js, crypto.randomInt over
// the weights in functions/prizes.js) n times (default 100000) and prints the
// observed distribution next to the weights.
const { PRIZES, TOTAL_WEIGHT } = require("../functions/prizes");
const { drawPrize } = require("../functions/lib/wheel");

const n = Number(process.argv[2]) || 100000;
const counts = Object.fromEntries(PRIZES.map((p) => [p.id, 0]));
for (let i = 0; i < n; i += 1) counts[drawPrize().id] += 1;

console.log(`${n} draws through drawPrize()`);
let chi = 0;
for (const p of PRIZES) {
  const want = (p.weight / TOTAL_WEIGHT) * 100;
  const got = (counts[p.id] / n) * 100;
  const exp = (p.weight / TOTAL_WEIGHT) * n;
  chi += (counts[p.id] - exp) ** 2 / exp;
  console.log(
    `${p.id.padEnd(14)} ${p.capped ? "capped " : "       "} expected ${want.toFixed(2).padStart(6)}%  observed ${got.toFixed(2).padStart(6)}%  (${counts[p.id]})`
  );
}
// 10 degrees of freedom: chi-square above 29.6 would be a 0.1% fluke.
console.log(`chi-square ${chi.toFixed(2)} (10 degrees of freedom; above 29.6 would be suspicious)`);
