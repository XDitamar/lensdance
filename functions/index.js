// functions/index.js
//
// Cloud Functions (2nd gen) for the prize wheel. The wheel's server side lives
// in Firebase, not on Vercel: see lib/wheel.js for the rules, handlers.js for
// the callables, and firestore.rules (users/{uid}/prizes is read-only to clients).
//
// COST GUARDS on every function: at most 5 instances, 30 s, 256 MiB, no warm
// instances, and no scheduled functions anywhere.

const admin = require("firebase-admin");
// firebase-admin 13: FieldValue and getFirestore come from the modular entry point
// (admin.firestore.FieldValue is undefined there; only a real Firestore finds that out).
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { FUNCTIONS_REGION } = require("./prizes");
const { makeHandlers } = require("./handlers");

admin.initializeApp();

// Comma-separated emails that may run TEST spins besides the admin. Not a
// secret: set it in functions/.env (see functions/env.example). Unset = admin only.
const WHEEL_TEST_EMAILS = defineString("WHEEL_TEST_EMAILS", { default: "" });

const OPTIONS = {
  region: FUNCTIONS_REGION,
  maxInstances: 5,
  timeoutSeconds: 30,
  memory: "256MiB",
  minInstances: 0,
};

const handlers = makeHandlers({
  db: getFirestore(),
  HttpsError,
  now: () => new Date(),
  serverTimestamp: () => FieldValue.serverTimestamp(),
  testEmails: () => WHEEL_TEST_EMAILS.value(),
});

exports.spin = onCall(OPTIONS, handlers.spin);
exports.redeemPrize = onCall(OPTIONS, handlers.redeemPrize);
exports.savePrizeExtra = onCall(OPTIONS, handlers.savePrizeExtra);
exports.checkPrizeCode = onCall(OPTIONS, handlers.checkPrizeCode);
