// src/lib/prizeCodeState.js
//
// The "I have a discount code" control on the registration form, as a pure
// state machine: no React, no network, no Firebase. The component
// (src/components/PrizeCodeApply.jsx) dispatches actions; when `phase` becomes
// "checking" it asks the server (checkPrizeCode) and dispatches the answer.
// Keeping the transitions here means every one of them is tested.
//
//   phase     "idle" | "checking" | "applied"
//   error     null | "empty" | "not-found" | "redeemed" | "expired" | "capped" |
//             "attached" | "network"      (the last part of competition.prizeCode.*)
//
// Nothing here is proof of anything: an applied code is a REQUEST that travels
// with the order as a hint for Alina. Redemption re-checks everything on the
// server (redeemPrize).

/** "LD-" and six of ABCDEFGHJKLMNPQRSTUVWXYZ23456789: no 0, O, 1, I. */
const CODE_BODY = /^[A-HJ-NP-Z2-9]{6}$/;

/**
 * What a customer typed -> "LD-XXXXXX", or null when it cannot be a code. The
 * same rules as normaliseCode in functions/lib/wheel.js (a test compares them):
 * forgiving about case, spaces, hyphens and the prefix; strict about the six
 * characters.
 */
export function normaliseCode(raw) {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = s.length === 8 && s.startsWith("LD") ? s.slice(2) : s;
  return CODE_BODY.test(body) ? `LD-${body}` : null;
}

export const initialState = { open: false, phase: "idle", value: "", applied: null, error: null };

/** The server's `reason` -> the message key. Anything new we do not know says "not found". */
const REASON_TO_ERROR = {
  "not-found": "not-found",
  "bad-code": "not-found",
  redeemed: "redeemed",
  expired: "expired",
  "capped-limit": "capped",
};

export function prizeCodeReducer(state, action) {
  switch (action.type) {
    case "toggle":
      // While a code is applied there is nothing to open: it has its own "remove".
      if (state.phase === "applied") return state;
      return { ...state, open: !state.open, error: null };

    case "type":
      return { ...state, value: String(action.value || "").toUpperCase(), error: null };

    case "fill":
      // A chip: put the code in the field, nothing more. Applying is a deliberate press.
      return { ...state, open: true, value: String(action.code || "").toUpperCase(), error: null };

    case "submit": {
      if (state.phase !== "idle") return state; // already checking, or already applied
      if (!state.value.trim()) return { ...state, error: "empty" };
      const code = normaliseCode(state.value);
      // Cannot be a code at all: answered here, in the same words as "not found".
      if (!code) return { ...state, error: "not-found" };
      if ((action.attached || []).includes(code)) return { ...state, error: "attached" };
      return { ...state, phase: "checking", error: null };
    }

    case "result": {
      if (state.phase !== "checking") return state; // a stale answer: ignore it
      const data = action.data || {};
      if (data.ok === true) {
        return {
          ...state,
          phase: "applied",
          open: true,
          error: null,
          applied: {
            code: normaliseCode(state.value),
            prizeId: data.prize?.prizeId || null,
            label: data.prize?.label || "",
            validUntil: data.validUntil || null,
          },
        };
      }
      return { ...state, phase: "idle", error: REASON_TO_ERROR[data.reason] || "not-found" };
    }

    case "fail":
      if (state.phase !== "checking") return state;
      return { ...state, phase: "idle", error: "network" };

    case "remove":
      return { ...state, phase: "idle", applied: null, value: "", open: true, error: null };

    default:
      return state;
  }
}
