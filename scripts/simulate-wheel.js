// node scripts/simulate-wheel.js [n]
// Runs the real server draw n times (default 100000) and prints observed odds,
// for a customer with no capped prize and for one who already holds one (the
// redraw among non-capped prizes, weights renormalised).
const crypto = require("crypto");
const { PRIZES, pickPrize, poolWeight } = require("../api/_prizes");

const n = Number(process.argv[2]) || 100000;

function run(excludeCapped) {
  const total = poolWeight({ excludeCapped });
  const counts = Object.fromEntries(PRIZES.map((p) => [p.id, 0]));
  for (let i = 0; i < n; i += 1) counts[pickPrize(crypto.randomInt(total), { excludeCapped }).id] += 1;
  console.log(`\n${n} draws, ${excludeCapped ? "customer already holds a capped prize" : "no capped prize held"}`);
  for (const p of PRIZES) {
    const want = excludeCapped && p.capped ? 0 : (p.weight / total) * 100;
    const got = (counts[p.id] / n) * 100;
    console.log(
      `${p.id.padEnd(14)} ${p.capped ? "capped " : "       "} expected ${want.toFixed(2).padStart(6)}%  observed ${got.toFixed(2).padStart(6)}%  (${counts[p.id]})`
    );
  }
}

run(false);
run(true);
