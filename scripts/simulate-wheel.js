// node scripts/simulate-wheel.js [n]
// Runs the REAL draw path (drawForOrder in api/_verify.js: HMAC of uid + order
// id mapped onto the weights) for n different orders (default 100000) and
// prints the observed distribution next to the weights. Uses a throwaway
// secret for this process only.
const crypto = require("crypto");
process.env.SPIN_SECRET = process.env.SPIN_SECRET || crypto.randomBytes(16).toString("hex");

const { PRIZES, TOTAL_WEIGHT } = require("../api/_prizes");
const { drawForOrder } = require("../api/_verify");

const n = Number(process.argv[2]) || 100000;
const orderId = () => crypto.randomBytes(15).toString("base64").replace(/[^A-Za-z0-9]/g, "a").slice(0, 20);

const counts = Object.fromEntries(PRIZES.map((p) => [p.id, 0]));
for (let i = 0; i < n; i += 1) {
  counts[drawForOrder(`uid${i % 997}`, orderId()).prize.id] += 1;
}

console.log(`${n} orders drawn through drawForOrder()`);
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

// Determinism: the same order, asked 1000 times, never changes.
const o = orderId();
const first = JSON.stringify(drawForOrder("uidX", o));
let same = true;
for (let i = 0; i < 1000; i += 1) if (JSON.stringify(drawForOrder("uidX", o)) !== first) same = false;
console.log(`same order drawn 1000 times: ${same ? "always the same prize and code" : "DIFFERED"}`);
