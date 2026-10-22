// scripts/firestore-rules.test.js
//
// Tests the `spins` rules in firestore.rules against the real Firestore emulator.
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
// Every "refused" case changes ONE property of a valid create, and the valid
// create is tested to succeed, so a refusal is for the reason named.
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
const TS = () => firebase.firestore.FieldValue.serverTimestamp();

const good = (uid = "alice", over = {}) => ({
  uid, prizeId: "disc-5", label: "5% הנחה על חבילה לבחירתך", code: "LD-AB23",
  sig: "0123456789abcdef0123456789abcdef", createdAt: TS(), redeemedAt: null, ...over,
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
    await db.doc("registrations/ORDERALICE1").set({ userId: "alice", submittedAt: new Date() });
    await db.doc("registrations/ORDERALICE2").set({ userId: "alice", submittedAt: new Date() });
    await db.doc("registrations/ORDERBOB001").set({ userId: "bob", submittedAt: new Date() });
    await db.doc("registrations/ORDERANON01").set({ userId: null, submittedAt: new Date() });
    await db.doc("spins/ORDERALICE2").set({ ...good("alice"), createdAt: new Date() });   // already spun
    await db.doc("spins/ORDERBOB001").set({ ...good("bob"), createdAt: new Date() });
  });
  const alice = env.authenticatedContext("alice", { email: "alice@x.com" }).firestore();
  const bob = env.authenticatedContext("bob", { email: "bob@x.com" }).firestore();
  const admin = env.authenticatedContext("adm", { email: "lensdance29@gmail.com" }).firestore();
  const anon = env.unauthenticatedContext().firestore();

  console.log("== create ==");
  await check("owner creates the record for their own order", assertSucceeds(alice.doc("spins/ORDERALICE1").set(good())));
  await check("a second create for the same order is refused (it would be an update)", assertFails(alice.doc("spins/ORDERALICE1").set(good())));
  await check("create on an order that was already spun is refused", assertFails(alice.doc("spins/ORDERALICE2").set(good())));
  await check("create on SOMEONE ELSE'S order is refused", assertFails(alice.doc("spins/ORDERBOB001").set(good("alice"))));
  await check("create with another person's uid is refused", assertFails(bob.doc("spins/ORDERANON01").set(good("alice"))));
  await check("create on an order that does not exist is refused", assertFails(alice.doc("spins/NOSUCHORDER1").set(good())));
  await check("create on an order with no owner is refused", assertFails(alice.doc("spins/ORDERANON01").set(good())));
  await check("signed-out create is refused", assertFails(anon.doc("spins/ORDERALICE1").set(good())));
  const fresh = async (id, uid, over, ctxDb) => {
    await env.withSecurityRulesDisabled((c) => c.firestore().doc(`registrations/${id}`).set({ userId: uid, submittedAt: new Date() }));
    return ctxDb.doc(`spins/${id}`).set(good(uid, over));
  };
  await check("an extra field is refused", assertFails(fresh("ORDEREXTRA01", "alice", { bonus: 1 }, alice)));
  await check("a missing field is refused", assertFails((async () => { await env.withSecurityRulesDisabled((c) => c.firestore().doc("registrations/ORDERMISS001").set({ userId: "alice" })); const d = good(); delete d.sig; return alice.doc("spins/ORDERMISS001").set(d); })()));
  await check("a client-chosen createdAt (not server time) is refused", assertFails(fresh("ORDERTIME001", "alice", { createdAt: new Date("2020-01-01") }, alice)));
  await check("an already-redeemed record is refused", assertFails(fresh("ORDERREDEEM1", "alice", { redeemedAt: new Date() }, alice)));
  await check("a malformed code is refused", assertFails(fresh("ORDERCODE001", "alice", { code: "NOPE" }, alice)));
  await check("a signature of the wrong length is refused", assertFails(fresh("ORDERSIG0001", "alice", { sig: "short" }, alice)));
  await check("an over-long label is refused", assertFails(fresh("ORDERLABEL01", "alice", { label: "x".repeat(400) }, alice)));
  await check("a prizeId that is not a string is refused", assertFails(fresh("ORDERTYPE001", "alice", { prizeId: 5 }, alice)));

  console.log("== read ==");
  await check("owner reads their own record", assertSucceeds(alice.doc("spins/ORDERALICE2").get()));
  await check("another customer cannot read it", assertFails(bob.doc("spins/ORDERALICE2").get()));
  await check("signed-out cannot read it", assertFails(anon.doc("spins/ORDERALICE2").get()));
  await check("admin reads any record", assertSucceeds(admin.doc("spins/ORDERBOB001").get()));
  await check("reading a record that does not exist is allowed (so the server can say 'not spun yet')", assertSucceeds(alice.doc("spins/NOTSPUN0001").get()));
  await check("owner lists their own (constrained by uid)", assertSucceeds(alice.collection("spins").where("uid", "==", "alice").get()));
  await check("an unconstrained listing is refused", assertFails(alice.collection("spins").get()));
  await check("listing somebody else's records is refused", assertFails(alice.collection("spins").where("uid", "==", "bob").get()));
  await check("admin lists a customer's records", assertSucceeds(admin.collection("spins").where("uid", "==", "bob").get()));

  console.log("== update / delete ==");
  await check("the customer cannot change redeemedAt", assertFails(alice.doc("spins/ORDERALICE2").update({ redeemedAt: new Date() })));
  await check("the customer cannot change the prize", assertFails(alice.doc("spins/ORDERALICE2").update({ prizeId: "jackpot" })));
  await check("admin stamps redeemedAt", assertSucceeds(admin.doc("spins/ORDERALICE2").update({ redeemedAt: TS() })));
  await check("admin can undo it (null)", assertSucceeds(admin.doc("spins/ORDERALICE2").update({ redeemedAt: null })));
  await check("admin cannot change the prize", assertFails(admin.doc("spins/ORDERALICE2").update({ prizeId: "jackpot" })));
  await check("admin cannot change the code", assertFails(admin.doc("spins/ORDERALICE2").update({ code: "LD-ZZZZ" })));
  await check("admin cannot put a non-timestamp in redeemedAt", assertFails(admin.doc("spins/ORDERALICE2").update({ redeemedAt: "yesterday" })));
  await check("admin cannot change redeemedAt AND something else", assertFails(admin.doc("spins/ORDERALICE2").update({ redeemedAt: TS(), label: "x" })));
  await check("nobody can delete (customer)", assertFails(alice.doc("spins/ORDERALICE2").delete()));
  await check("nobody can delete (admin)", assertFails(admin.doc("spins/ORDERALICE2").delete()));

  console.log("== nothing else was opened up ==");
  await check("registrations are still not readable by another customer", assertFails(bob.doc("registrations/ORDERALICE1").get()));
  await check("registrations are still readable by their owner", assertSucceeds(alice.doc("registrations/ORDERALICE1").get()));

  await env.cleanup();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
