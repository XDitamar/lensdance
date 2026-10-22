// scripts/firestore-rules.test.js
//
// Tests the prize wheel's rules in firestore.rules against the real Firestore
// emulator: users/{uid}/prizes/{orderId} is READ-ONLY to every client (only the
// Cloud Functions, whose Admin SDK bypasses rules, ever write it).
// Not part of `npm test` (it needs Java 11+ and the emulator), and it adds no
// dependency to the project: install the tools in a scratch folder instead.
//
//   1. In an empty scratch folder:  npm init -y
//                                   npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
//   2. Put a firebase.json there:
//        {"firestore":{"rules":"<this repo>/firestore.rules"},
//         "emulators":{"firestore":{"host":"127.0.0.1","port":8085},"ui":{"enabled":false}}}
//   3. Point NODE_PATH at that folder's node_modules, then run:
//        npx firebase emulators:exec --only firestore --project demo-wheel "node <this repo>/scripts/firestore-rules.test.js"
//
// If you would rather check by hand: Firebase console, Firestore, Rules, Rules
// Playground, simulate a `get` / `create` on /users/SOMEUID/prizes/SOMEORDER as
// that user, as another user and as the admin.

const fs = require("fs");
const path = require("path");
// Load the three tools from the scratch folder (NODE_PATH), never from this
// project's own node_modules: its newer `firebase` would not match the one the
// testing library was built against.
const need = (m) => require(require.resolve(m, { paths: (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean) }));
const { initializeTestEnvironment, assertSucceeds, assertFails } = need("@firebase/rules-unit-testing");
const firebase = need("firebase/compat/app");
need("firebase/compat/firestore");

const RULES = path.join(__dirname, "..", "firestore.rules");
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");

const prize = (over = {}) => ({
  prizeId: "disc-5", label: "x", tier: "common", code: "LD-AB23CD", orderId: "ORDERALICE1", issuedAt: 1000,
  createdAt: new Date(), validUntil: "2027-06-30", redeemed: null, extra: null, ...over,
});

let pass = 0, fail = 0;
const check = async (name, promise) => {
  try { await promise; pass++; console.log("PASS ", name); }
  catch (e) { fail++; console.log("FAIL ", name, "-", String(e.message || e).split("\n")[0].slice(0, 140)); }
};

(async () => {
  const env = await initializeTestEnvironment({ projectId: "demo-wheel", firestore: { rules: fs.readFileSync(RULES, "utf8"), host, port: Number(port) } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("users/alice/prizes/ORDERALICE1").set(prize());
    await db.doc("users/bob/prizes/ORDERBOB0001").set(prize({ orderId: "ORDERBOB0001" }));
    await db.doc("users/alice").set({ name: "Alice" });
    await db.doc("registrations/ORDERALICE1").set({ userId: "alice" });
    await db.doc("spins/ORDERALICE1").set({ uid: "alice" }); // leftover shape from the earlier design
  });
  const alice = env.authenticatedContext("alice", { email: "alice@x.com" }).firestore();
  const bob = env.authenticatedContext("bob", { email: "bob@x.com" }).firestore();
  const admin = env.authenticatedContext("adm", { email: "lensdance29@gmail.com" }).firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log("== reading ==");
  await check("the owner reads their prize", assertSucceeds(alice.doc("users/alice/prizes/ORDERALICE1").get()));
  await check("the owner lists their prizes", assertSucceeds(alice.collection("users/alice/prizes").get()));
  await check("another customer cannot read it", assertFails(bob.doc("users/alice/prizes/ORDERALICE1").get()));
  await check("another customer cannot list them", assertFails(bob.collection("users/alice/prizes").get()));
  await check("signed-out cannot read it", assertFails(anon.doc("users/alice/prizes/ORDERALICE1").get()));
  await check("the admin reads any customer's prize", assertSucceeds(admin.doc("users/bob/prizes/ORDERBOB0001").get()));
  await check("the admin lists a customer's prizes", assertSucceeds(admin.collection("users/bob/prizes").get()));
  await check("nobody can sweep every prize with a collection-group query", assertFails(alice.collectionGroup("prizes").get()));

  console.log("== writing: no client can, not even the owner or the admin ==");
  await check("owner cannot create a prize", assertFails(alice.doc("users/alice/prizes/ORDERNEW0001").set(prize({ orderId: "ORDERNEW0001", prizeId: "jackpot" }))));
  await check("owner cannot upgrade their prize", assertFails(alice.doc("users/alice/prizes/ORDERALICE1").update({ prizeId: "jackpot" })));
  await check("owner cannot mark their prize redeemed (or un-redeemed)", assertFails(alice.doc("users/alice/prizes/ORDERALICE1").update({ redeemed: null })));
  await check("owner cannot write the details of a prize", assertFails(alice.doc("users/alice/prizes/ORDERALICE1").update({ extra: { type: "team" } })));
  await check("owner cannot delete a prize (to hide it from the cap)", assertFails(alice.doc("users/alice/prizes/ORDERALICE1").delete()));
  await check("another customer cannot write into someone's prizes", assertFails(bob.doc("users/alice/prizes/ORDERBOB0001").set(prize())));
  await check("signed-out cannot write", assertFails(anon.doc("users/alice/prizes/ORDERANON001").set(prize())));
  await check("the admin cannot create a prize from the browser either", assertFails(admin.doc("users/alice/prizes/ORDERADMIN01").set(prize())));
  await check("the admin cannot edit a prize from the browser either", assertFails(admin.doc("users/alice/prizes/ORDERALICE1").update({ redeemed: { by: "x" } })));
  await check("the admin cannot delete a prize from the browser either", assertFails(admin.doc("users/alice/prizes/ORDERALICE1").delete()));

  console.log("== the rest of the app is untouched ==");
  await check("the owner can still edit their own profile", assertSucceeds(alice.doc("users/alice").set({ name: "Alice B" }, { merge: true })));
  await check("a customer still cannot edit another's profile", assertFails(bob.doc("users/alice").set({ name: "x" }, { merge: true })));
  await check("registrations: still not readable by another customer", assertFails(bob.doc("registrations/ORDERALICE1").get()));
  await check("registrations: still readable by their owner", assertSucceeds(alice.doc("registrations/ORDERALICE1").get()));
  await check("the old `spins` collection is closed to everyone (owner)", assertFails(alice.doc("spins/ORDERALICE1").get()));
  await check("the old `spins` collection is closed to everyone (admin)", assertFails(admin.doc("spins/ORDERALICE1").get()));

  await env.cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
