// src/components/PrizeCodeApply.jsx
//
// "I have a discount code": a small control on the registration form that lets a
// returning customer attach a prize they won earlier to THIS new order.
//
// ── A REQUEST, NOT AN ENTITLEMENT ──────────────────────────────────────────
// Applying a code does not discount anything and does not redeem anything. It
// asks the server (checkPrizeCode) whether the code is one of THIS customer's
// own prizes and still usable, tells the customer what it gives, and lets the
// form write the code on the registration as a HINT for Alina. She redeems it
// from the admin page once the deposit is paid; redeemPrize re-checks
// everything on the server, so a code written by hand costs nobody anything.
//
// The behaviour is a pure state machine (src/lib/prizeCodeState.js, tested);
// this file only draws it and runs the one network call.
//
// ── PHONE FIRST ────────────────────────────────────────────────────────────
// Most customers are on phones: 44px touch targets, a 16px field (iOS zooms the
// page on anything smaller), Enter applies the code instead of submitting the
// whole form, the field is scrolled into view when opened and focused (so the
// keyboard does not hide it), and the status line is announced politely.

import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { checkPrizeCode, fetchRewards } from "../lib/rewards";
import { checkPrize } from "../lib/prizeRules";
import { initialState, normaliseCode, prizeCodeReducer } from "../lib/prizeCodeState";
import "./PrizeCodeApply.css";

/**
 * @param {{ user: { uid: string } | null,
 *           attachedCodes?: string[],
 *           onChange: (applied: { code: string, prizeId: string } | null) => void }} props
 *   attachedCodes: codes already written on this customer's other registrations.
 */
export default function PrizeCodeApply({ user, attachedCodes = [], onChange }) {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(prizeCodeReducer, initialState);
  const [prizes, setPrizes] = useState(null); // the customer's own prizes, for the chips
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const attached = useMemo(() => attachedCodes.map((c) => normaliseCode(c)).filter(Boolean), [attachedCodes]);

  // Tell the form what is applied (or that nothing is).
  useEffect(() => { onChange(state.applied); }, [state.applied]); // eslint-disable-line react-hooks/exhaustive-deps

  // The one network call: when the machine says "checking", ask, and report back.
  useEffect(() => {
    if (state.phase !== "checking") return undefined;
    let live = true;
    checkPrizeCode(normaliseCode(state.value))
      .then((data) => { if (live) dispatch({ type: "result", data }); })
      .catch((e) => { console.warn("Prize code not checked:", e?.code || e); if (live) dispatch({ type: "fail" }); });
    return () => { live = false; };
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // On the first open, read the customer's own prizes so the ones still usable
  // can be offered as chips (a customer who forgot the code). Display only: the
  // server is the judge. A failed read just means no chips.
  useEffect(() => {
    if (!state.open || prizes !== null || !user?.uid) return;
    fetchRewards(user.uid).then((r) => setPrizes(r.prizes));
  }, [state.open, prizes, user]);

  // Opening: bring the box into view, so the keyboard never hides the field or the button.
  const reveal = () => {
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    boxRef.current?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  };
  useEffect(() => {
    if (state.open) requestAnimationFrame(reveal);
  }, [state.open]);

  if (!user?.uid) return null;

  const chips = (prizes || []).filter(
    (p) => !checkPrize({ prize: p, allPrizes: prizes }) && !attached.includes(p.code)
  );
  const explain = (id) => t(`prize.items.${id}.explain`, { defaultValue: "" });

  const message =
    state.phase === "checking" ? t("competition.prizeCode.checking")
      : state.error === "empty" ? t("competition.prizeCode.empty")
      : state.error ? t(`competition.prizeCode.${state.error === "not-found" ? "notFound" : state.error}`)
      : "";

  /* ── applied: a calm confirmation, and a way out ───────────────────────── */
  if (state.phase === "applied") {
    return (
      <div className="pca">
        <div className="pca-box pca-applied" role="status">
          <p className="pca-line">
            <Trans
              i18nKey="competition.prizeCode.applied"
              values={{ code: state.applied.code }}
              components={{ c: <bdi translate="no" className="pca-code" /> }}
            />
          </p>
          {explain(state.applied.prizeId) && <p className="pca-line pca-gives">{explain(state.applied.prizeId)}</p>}
          <p className="pca-line pca-note">{t("competition.prizeCode.appliedNote")}</p>
          <button type="button" className="pca-btn pca-btn-quiet" onClick={() => dispatch({ type: "remove" })}>
            {t("competition.prizeCode.remove")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pca">
      <button
        type="button"
        className="pca-toggle"
        aria-expanded={state.open}
        aria-controls="pca-panel"
        onClick={() => dispatch({ type: "toggle" })}
      >
        {t("competition.prizeCode.toggle")}
      </button>

      {state.open && (
        <div className="pca-box" id="pca-panel" ref={boxRef}>
          {chips.length > 0 && (
            <div className="pca-chips">
              {chips.map((p) => (
                <button key={p.code} type="button" className="pca-chip" onClick={() => { dispatch({ type: "fill", code: p.code }); inputRef.current?.focus(); }}>
                  <Trans
                    i18nKey="competition.prizeCode.chip"
                    values={{ code: p.code }}
                    components={{ c: <bdi translate="no" className="pca-code" /> }}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="pca-row">
            <input
              ref={inputRef}
              className="pca-input"
              type="text"
              dir="ltr"
              inputMode="text"
              enterKeyHint="done"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              value={state.value}
              placeholder={t("competition.prizeCode.placeholder")}
              aria-label={t("competition.prizeCode.label")}
              onChange={(e) => dispatch({ type: "type", value: e.target.value })}
              // Enter applies the code. It must NOT submit the whole registration.
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  dispatch({ type: "submit", attached });
                }
              }}
              // The phone keyboard rises after a moment: bring the box back into view once it has.
              onFocus={() => setTimeout(reveal, 300)}
            />
            <button
              type="button"
              className="pca-btn"
              disabled={state.phase === "checking"}
              onClick={() => dispatch({ type: "submit", attached })}
            >
              {state.phase === "checking" ? t("competition.prizeCode.checking") : t("competition.prizeCode.apply")}
            </button>
          </div>

          {/* Announced politely whenever it changes; always in the page so the
              announcement is reliable. */}
          <p className={`pca-msg${state.error ? " pca-msg-error" : ""}`} role="status" aria-live="polite">
            {message}
            {state.error === "empty" && (
              <>
                {" "}
                <Link className="pca-link" to="/prize">{t("competition.prizeCode.emptyLink")}</Link>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
