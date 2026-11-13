// functions/e2e/wheel-api.js
//
// End-to-end test of the prize wheel against the Firebase EMULATORS (Auth,
// Firestore, Functions): the real functions code, the real firestore.rules and
// real transactions, with nothing touching the real project. 55 checks: spinning, the code check for the registration form,
// the refusals, TEST mode, the rules (a customer cannot write a prize), redeeming,
// the one-capped-prize rule and the team / jackpot details.
//
//   1. Java 17 and firebase-tools are needed. Put the tester's email in
//      functions/.env.lensdance-8d29c (git-ignored):  WHEEL_TEST_EMAILS=test@gmail.com
//   2. From the repo root, in one terminal:
//        firebase emulators:start --only functions,firestore,auth --project lensdance-8d29c
//      (the project id must be the app's own, because the browser app is wired to it)
//   3. In another:   node functions/e2e/wheel-api.js
//
// Run it against a FRESH emulator (restart it first): it creates users and orders
// that a second run would find already spun. It never needs a login or a secret.

// End-to-end against the Firebase emulators (Auth 9099, Firestore 8080, Functions 5001).
// Real functions code, real rules, real transactions. Nothing here touches real Firebase.
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FS = "http://127.0.0.1:8080/v1/projects/lensdance-8d29c/databases/(default)/documents";
const FN = "http://127.0.0.1:5001/lensdance-8d29c/europe-west1";
const ADMIN_EMAIL = "lensdance29@gmail.com";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`); };

async function signUp(email, password = "pw-" + email) {
  const r = await (await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  if (r.localId) return { uid: r.localId, token: r.idToken, email };
  // already there from an earlier run of this script
  const s = await (await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  return { uid: s.localId, token: s.idToken, email };
}
const enc = (v) => v === null ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { timestampValue: new Date(v).toISOString() } : v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } } : { stringValue: String(v) };
const put = (path, obj) => fetch(`${FS}/${path}`, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, enc(v)])) }) });
const dec = (f) => f == null ? null : "stringValue" in f ? f.stringValue : "booleanValue" in f ? f.booleanValue : "integerValue" in f ? Number(f.integerValue) : "timestampValue" in f ? f.timestampValue : "nullValue" in f ? null : "mapValue" in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, dec(v)])) : f;
const getDoc = async (path, token = "owner") => { const r = await fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${token}` } }); return { status: r.status, data: r.ok ? Object.fromEntries(Object.entries((await r.json()).fields || {}).map(([k, v]) => [k, dec(v)])) : null }; };
const listDocs = async (path) => { const r = await (await fetch(`${FS}/${path}`, { headers: { Authorization: "Bearer owner" } })).json(); return r.documents || []; };

async function call(name, data, token) {
  const r = await fetch(`${FN}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  const body = await r.json();
  return body.error ? { error: true, status: body.error.status, details: body.error.details, message: body.error.message } : { error: false, ...body.result };
}
const why = (r) => (r.error ? r.details || r.status : "OK");

(async () => {
  const day = 86400000, t0 = Date.parse("2026-10-20T10:00:00Z");
  const cust = await signUp("test@gmail.com");
  const other = await signUp("other@x.com");
  const admin = await signUp(ADMIN_EMAIL);
  console.log("signed up in the Auth emulator:", [cust, other, admin].map((u) => u.email).join(", "));

  const reg = (id, userId, submittedAt, depositPaid = false) => put(`registrations/${id}`, { userId, submittedAt, depositPaid, competitionTitle: "Emulator cup" });
  const O1 = "AAAAAAAAAAAAAAAAAAAA", O2 = "BBBBBBBBBBBBBBBBBBBB", O3 = "CCCCCCCCCCCCCCCCCCCC", OEARLY = "DDDDDDDDDDDDDDDDDDDD";
  const OOTHER = "EEEEEEEEEEEEEEEEEEEE", OLATE = "FFFFFFFFFFFFFFFFFFFF", OANON = "GGGGGGGGGGGGGGGGGGGG", OPAR = "HHHHHHHHHHHHHHHHHHHH";
  await Promise.all([
    reg(O1, cust.uid, t0, false), reg(O2, cust.uid, t0 + 5 * day, true), reg(O3, cust.uid, t0 + 6 * day, false),
    reg(OEARLY, cust.uid, t0 - 10 * day, true), reg(OOTHER, other.uid, t0, true),
    reg(OLATE, cust.uid, Date.parse("2027-01-03T10:00:00Z"), true), reg(OANON, null, t0, false), reg(OPAR, cust.uid, t0 + 1 * day, false),
  ]);

  console.log("\n== spin: real ==");
  const s1 = await call("spin", { orderId: O1 }, cust.token);
  check("a customer spins their own order", !s1.error && /^LD-[A-HJ-NP-Z2-9]{6}$/.test(s1.code), `${s1.prize?.id} ${s1.code}`);
  const doc1 = await getDoc(`users/${cust.uid}/prizes/${O1}`);
  check("the prize document exists under their own data with exactly the agreed fields", doc1.status === 200 && Object.keys(doc1.data).sort().join() === "code,createdAt,extra,issuedAt,label,orderId,prizeId,redeemed,tier,validUntil", Object.keys(doc1.data || {}).join());
  check("issuedAt is the ORDER's time, validUntil is the season end, redeemed and extra are empty", doc1.data.issuedAt === t0 && doc1.data.validUntil === "2027-06-30" && doc1.data.redeemed === null && doc1.data.extra === null);
  const s1b = await call("spin", { orderId: O1 }, cust.token);
  check("spinning the same order again returns the identical prize", s1b.code === s1.code && s1b.prize.id === s1.prize.id);

  const burst = await Promise.all(Array.from({ length: 8 }, () => call("spin", { orderId: O2 }, cust.token)));
  const docsAfter = (await listDocs(`users/${cust.uid}/prizes`)).filter((d) => d.name.endsWith(`/${O2}`));
  check("8 simultaneous spins on one order: all get the same prize, ONE document", burst.every((b) => !b.error && b.code === burst[0].code) && docsAfter.length === 1, `${new Set(burst.map((b) => b.code)).size} distinct code(s), ${docsAfter.length} document(s)`);

  console.log("\n== spin: refused ==");
  const refused = {
    "not signed in": [await call("spin", { orderId: O3 }, null), "UNAUTHENTICATED"],
    "someone else's order": [await call("spin", { orderId: OOTHER }, cust.token), "order-not-yours"],
    "a sign-up made while signed out": [await call("spin", { orderId: OANON }, cust.token), "order-not-yours"],
    "an order placed after 31.12.2026": [await call("spin", { orderId: OLATE }, cust.token), "order-too-late"],
    "an order that does not exist": [await call("spin", { orderId: "ZZZZZZZZZZZZZZZZZZZZ" }, cust.token), "order-not-found"],
    "a malformed order id": [await call("spin", { orderId: "../users/x" }, cust.token), "bad-order"],
    "test as a string, not the value true": [await call("spin", { test: "true" }, cust.token), "bad-order"],
  };
  for (const [name, [r, expected]] of Object.entries(refused)) check(`refused: ${name}`, r.error && (r.details === expected || r.status === expected), why(r));
  check("nothing was written for any refused spin", (await listDocs(`users/${cust.uid}/prizes`)).filter((d) => /\/(CCCC|GGGG|FFFF|ZZZZ)/.test(d.name)).length === 0 && (await listDocs(`users/${other.uid}/prizes`)).length === 0);

  console.log("\n== spin: TEST mode ==");
  const before = (await listDocs(`users/${cust.uid}/prizes`)).length;
  const tests = await Promise.all([1, 2, 3].map(() => call("spin", { test: true }, cust.token)));
  check("a listed tester gets random prizes with code TEST", tests.every((r) => !r.error && r.code === "TEST" && r.test === true && r.orderId === null), tests.map((r) => r.prize?.id).join(", "));
  check("TEST writes nothing", (await listDocs(`users/${cust.uid}/prizes`)).length === before);
  const nt = await call("spin", { test: true }, other.token);
  check("a customer who is not listed is refused (not-tester)", nt.error && nt.details === "not-tester", why(nt));
  const at = await call("spin", { test: true }, admin.token);
  check("the admin may always test", !at.error && at.code === "TEST");

  console.log("\n== rules, on the real emulator: clients cannot write prizes ==");
  const own = `${FS}/users/${cust.uid}/prizes/${O1}`;
  const w = async (method, token, body) => (await fetch(own, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body })).status;
  check("the owner CAN read their prize", (await getDoc(`users/${cust.uid}/prizes/${O1}`, cust.token)).status === 200);
  check("another customer cannot read it", (await getDoc(`users/${cust.uid}/prizes/${O1}`, other.token)).status === 403);
  check("the admin can read it", (await getDoc(`users/${cust.uid}/prizes/${O1}`, admin.token)).status === 200);
  check("the owner cannot upgrade it", (await w("PATCH", cust.token, JSON.stringify({ fields: { prizeId: { stringValue: "jackpot" } } }))) === 403);
  check("the owner cannot delete it", (await w("DELETE", cust.token)) === 403);
  check("the owner cannot create a prize of their own", (await fetch(`${FS}/users/${cust.uid}/prizes/NEWORDERNEWORDERNEW`, { method: "PATCH", headers: { Authorization: `Bearer ${cust.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { prizeId: { stringValue: "jackpot" } } }) })).status === 403);
  check("the admin cannot write one from the browser either", (await w("PATCH", admin.token, JSON.stringify({ fields: { redeemed: { nullValue: null } } }))) === 403);

  console.log("\n== redeemPrize ==");
  const R = (data, token = admin.token) => call("redeemPrize", { uid: cust.uid, ...data }, token);
  check("a customer cannot redeem", (await R({ orderId: O1, onOrderId: O2 }, cust.token)).details === "not-admin");
  check("not signed in cannot redeem", (await R({ orderId: O1, onOrderId: O2 }, null)).error);
  check("the order it was won on is refused (same-order)", (await R({ orderId: O1, onOrderId: O1 })).details === "same-order");
  check("an order with the deposit unpaid is refused", (await R({ orderId: O1, onOrderId: O3 })).details === "unpaid");
  check("an earlier order is refused (not-later)", (await R({ orderId: O1, onOrderId: OEARLY })).details === "not-later");
  check("someone else's order is refused (wrong-owner)", (await R({ orderId: O1, onOrderId: OOTHER })).details === "wrong-owner");
  const prizeIsCapped = ["disc-50", "pack-gift", "reel-gift", "three-free", "team", "jackpot"].includes(s1.prize.id);
  const ok = await R({ orderId: O1, onOrderId: O2 });
  check("a later, paid order of the same customer is accepted", !ok.error, why(ok));
  const rec = (await getDoc(`users/${cust.uid}/prizes/${O1}`)).data;
  check("it is recorded as { at, orderId, by }", rec.redeemed && rec.redeemed.orderId === O2 && rec.redeemed.by === ADMIN_EMAIL && rec.redeemed.at, JSON.stringify(rec.redeemed));
  check("redeeming it again is refused (already-redeemed)", (await R({ orderId: O1, onOrderId: O2 })).details === "already-redeemed");
  const undo = await R({ orderId: O1, undo: true });
  check("the admin can undo a mistaken redemption", !undo.error && (await getDoc(`users/${cust.uid}/prizes/${O1}`)).data.redeemed === null);
  check("a customer cannot undo", (await R({ orderId: O1, undo: true }, cust.token)).details === "not-admin");

  console.log("\n== the one-capped-prize rule (two capped prizes seeded as the functions would write them) ==");
  const cap = (orderId, prizeId, issuedAt, code) => put(`users/${other.uid}/prizes/${orderId}`, { prizeId, label: "x", tier: "rare", code, orderId, issuedAt, createdAt: new Date(), validUntil: "2027-06-30", redeemed: null, extra: null });
  const C1 = "IIIIIIIIIIIIIIIIIIII", C2 = "JJJJJJJJJJJJJJJJJJJJ", OPAID = "KKKKKKKKKKKKKKKKKKKK";
  await Promise.all([cap(C1, "disc-50", t0, "LD-CAPAAA"), cap(C2, "jackpot", t0 + day, "LD-CAPBBB"), reg(OPAID, other.uid, t0 + 9 * day, true)]);
  const RO = (data) => call("redeemPrize", { uid: other.uid, ...data }, admin.token);
  check("the customer's SECOND capped prize is refused (capped-limit)", (await RO({ orderId: C2, onOrderId: OPAID })).details === "capped-limit");
  check("their FIRST (earliest) capped prize is accepted", !(await RO({ orderId: C1, onOrderId: OPAID })).error);
  check("after the first was redeemed, the second is still refused (they had their one)", (await RO({ orderId: C2, onOrderId: OPAID })).details === "capped-limit");

  console.log("\n== checkPrizeCode (the registration form) ==");
  const K = (code, token = cust.token) => call("checkPrizeCode", { code }, token);
  const mine = s1.code;                                                     // a real code of the customer's
  const k1 = await K(mine);
  check("a customer's own code is accepted and says what it gives", k1.ok === true && k1.prize.prizeId === s1.prize.id && k1.validUntil === "2027-06-30", JSON.stringify(k1.prize));
  const variants = [mine.toLowerCase(), mine.slice(3), `  ${mine.slice(0, 5)} ${mine.slice(5)} `, mine.replace("-", "")];
  const kv = await Promise.all(variants.map((v) => K(v)));
  check("typed in lower case, without LD-, with spaces or without the hyphen: the same prize", kv.every((r) => r.ok === true && r.prize.prizeId === s1.prize.id));
  const none = await K("LD-QQ22QQ");
  check("a code that does not exist: not-found", none.ok === false && none.reason === "not-found");
  const otherCode = await K(mine, other.token);
  check("someone else's real code answers exactly like a made-up one", otherCode.ok === false && otherCode.reason === "not-found" && JSON.stringify(otherCode) === JSON.stringify(none));
  check("TEST and LD-TEST are never valid (not-found)", (await K("TEST")).reason === "not-found" && (await K("ld-test")).reason === "not-found");
  check("rubbish is bad-code", (await K("abc")).reason === "bad-code" && (await K("")).reason === "bad-code" && (await K("x".repeat(60))).reason === "bad-code");
  check("not signed in is refused", (await K(mine, null)).error === true);
  check("a redeemed code says redeemed", (await call("checkPrizeCode", { code: "LD-CAPAAA" }, other.token)).reason === "redeemed");
  check("a customer's second capped code says capped-limit", (await call("checkPrizeCode", { code: "LD-CAPBBB" }, other.token)).reason === "capped-limit");

  console.log("\n== savePrizeExtra ==");
  const TEAM = "LLLLLLLLLLLLLLLLLLLL", PLAIN = "MMMMMMMMMMMMMMMMMMMM";
  const seedPrize = (orderId, prizeId, code) => put(`users/${cust.uid}/prizes/${orderId}`, { prizeId, label: "x", tier: "ultra", code, orderId, issuedAt: t0, createdAt: new Date(), validUntil: "2027-06-30", redeemed: null, extra: null });
  await Promise.all([seedPrize(TEAM, "team", "LD-TEAMAA"), seedPrize(PLAIN, "disc-5", "LD-PLAINA")]);
  const friends = Array.from({ length: 5 }, (_, i) => ({ name: `Friend ${i}`, contact: `f${i}@x.com` }));
  const X = (orderId, extra, token = cust.token) => call("savePrizeExtra", { orderId, extra }, token);
  check("a prize with no follow-up refuses details (wrong-type)", (await X(PLAIN, { type: "team", friends, consent: true })).details === "wrong-type");
  check("without consent: refused", (await X(TEAM, { type: "team", friends, consent: false })).details === "consent");
  check("only four friends: refused", (await X(TEAM, { type: "team", friends: friends.slice(0, 4), consent: true })).details === "count");
  check("someone else's prize: refused", (await X(TEAM, { type: "team", friends, consent: true }, other.token)).details === "prize-not-found");
  const saved = await X(TEAM, { type: "team", friends: friends.map((f) => ({ ...f, admin: true })), consent: true, evil: 1 });
  check("valid details are accepted, once", !saved.error);
  const extra = (await getDoc(`users/${cust.uid}/prizes/${TEAM}`)).data.extra;
  check("only the known fields were stored", extra && Object.keys(extra).sort().join() === "consent,friends,submittedAt,type" && !JSON.stringify(extra).includes("admin"), Object.keys(extra || {}).join());
  check("a second save is refused (already-submitted)", (await X(TEAM, { type: "team", friends, consent: true })).details === "already-submitted");
  const burstX = await Promise.all([1, 2, 3, 4].map(() => X(PLAIN.replace("M", "N"), { type: "team", friends, consent: true })));
  check("saving into a prize that does not exist is refused", burstX.every((r) => r.error));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (process.env.WHEEL_E2E_IDS) require("fs").writeFileSync(process.env.WHEEL_E2E_IDS, JSON.stringify({ cust, O1, O2, O3 })); // optional, for browser tests
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
