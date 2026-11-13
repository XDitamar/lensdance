// src/lib/functions.js
//
// The prize wheel's server side lives in Firebase Cloud Functions (functions/),
// not on Vercel. These are the three callables, called with the signed-in
// customer's (or admin's) own identity: the browser never sends a token by hand.
//
//   callSpin({ orderId } | { test: true })        a customer spins one order
//   callRedeemPrize({ uid, orderId, onOrderId })  the admin spends a prize (or { uid, orderId, undo: true })
//   callSavePrizeExtra({ orderId, extra })        the winner's team / jackpot details
//   callCheckPrizeCode({ code })                  "is this code usable?" (the registration form)
//
// The region is the single constant in api/_prizes.js (copied into
// src/config/prizes.js), the same one the functions are deployed with.

import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { USE_EMULATORS, app } from "../firebase";
import { FUNCTIONS_REGION } from "../config/prizes";

const functions = getFunctions(app, FUNCTIONS_REGION);
if (USE_EMULATORS) connectFunctionsEmulator(functions, "127.0.0.1", 5001);

export const callSpin = httpsCallable(functions, "spin");
export const callRedeemPrize = httpsCallable(functions, "redeemPrize");
export const callSavePrizeExtra = httpsCallable(functions, "savePrizeExtra");
export const callCheckPrizeCode = httpsCallable(functions, "checkPrizeCode");
