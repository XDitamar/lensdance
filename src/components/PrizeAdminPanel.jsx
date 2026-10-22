// src/components/PrizeAdminPanel.jsx
//
// A customer's prize-wheel gifts, for Alina, on the admin registrations page.
//
// For each prize: what it is, whether the server confirms its signature
// ("verified"), the order it was won on, when it expires, and whether it is
// redeemable (and if not, why). Redeeming is done AGAINST A SPECIFIC LATER
// ORDER of the same customer: the control is only enabled for orders whose
// deposit is marked paid and which are not the order the prize was won on, and
// the server (api/verify-prize.js, reading the order with Alina's own token)
// has the last word before anything is recorded.
//
// Everything about a prize in `users/{uid}` is text the customer could have
// written, so nothing here is believed until verifyPrizes() has answered. If
// that check cannot run (no /api, SPIN_SECRET missing) redeeming stays off.
//
// The redemption itself (which order, when) is written to retention/{uid}, the
// one document only the admin can write.

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchRewards, redeemedAt, setRedeemed, verifyPrizes } from "../lib/rewards";
import { dmy, prizeById } from "../config/prizes";

const box = { marginTop: 10, borderTop: "1px solid #EDE8DF", paddingTop: 8, fontFamily: "Arial,sans-serif", fontSize: 12.5, color: "#4A3525" };
const muted = { color: "#6A5A50" };

/**
 * orders: this customer's orders, [{ id, label, depositPaid, submittedAt (ms) }].
 * Kept in the parent's state, so marking a deposit paid updates the choices here.
 */
export default function PrizeAdminPanel({ uid, orders }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);           // { prizes, extras, redeemed }
  const [verdicts, setVerdicts] = useState(null);   // { state, byCode, secretConfigured }
  const [choice, setChoice] = useState({});         // prize code -> chosen order id
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState({});       // prize code -> message

  // Loaded on first open, not for every row of a long list.
  const load = async () => {
    if (data) return;
    const r = await fetchRewards(uid);
    setData(r);
    setVerdicts({ state: "loading" });
    // Always asked, even when the customer's own profile lists no prizes: the
    // server reads their spin records itself, so a prize they deleted from their
    // profile still shows up here.
    verifyPrizes(r.prizes, uid, undefined, { fromSpins: true })
      .then((v) => setVerdicts({ state: "ok", ...v }))
      .catch(() => setVerdicts({ state: "unavailable" }));
  };

  const orderName = (id) => {
    const o = orders.find((x) => x.id === id);
    return o ? (o.label || id) : id;
  };

  /** Later orders of this customer with the deposit paid, other than the winning one. */
  const eligibleOrders = (p) =>
    orders.filter((o) => o.depositPaid && o.id !== p.orderId && Number(o.submittedAt) > Number(p.issuedAt));

  const redeem = async (p) => {
    const orderId = choice[p.code];
    if (!orderId) return;
    setBusy(p.code);
    setProblem((m) => ({ ...m, [p.code]: "" }));
    try {
      // The server re-checks the prize AND the target order before we record anything.
      const v = await verifyPrizes(data.prizes, uid, orderId, { fromSpins: true });
      const verdict = v.byCode[p.code];
      if (!verdict?.redeemable) {
        setProblem((m) => ({ ...m, [p.code]: reasonText(verdict?.reason) }));
      } else if (!verdict.redeemOnOrder?.ok) {
        setProblem((m) => ({ ...m, [p.code]: whyText(verdict.redeemOnOrder?.reason) }));
      } else {
        await setRedeemed(uid, p.code, orderId, p.spinRecord ? p.orderId : null);
        setData((d) => ({ ...d, redeemed: { ...d.redeemed, [p.code]: { at: Date.now(), orderId } } }));
      }
    } catch (e) {
      setProblem((m) => ({ ...m, [p.code]: t("admin.prizeVerifyUnavailable") }));
    } finally {
      setBusy(null);
    }
  };

  const undo = async (p) => {
    setBusy(p.code);
    try {
      await setRedeemed(uid, p.code, null, p.spinRecord ? p.orderId : null);
      setData((d) => {
        const redeemed = { ...d.redeemed };
        delete redeemed[p.code];
        return { ...d, redeemed };
      });
    } catch (e) {
      setProblem((m) => ({ ...m, [p.code]: t("common.errorWithCode", { detail: e?.code || e?.message || "" }) }));
    } finally {
      setBusy(null);
    }
  };

  const reasonText = (reason) =>
    reason === "already-redeemed" ? t("admin.prizeAlreadyRedeemed")
      : reason === "expired" ? t("admin.prizeExpired")
      : reason === "capped-limit" ? t("admin.prizeCappedLimit")
      : reason === "duplicate-order" ? t("admin.prizeDuplicateOrder")
      : t("admin.prizeNotVerified");

  const whyText = (reason) =>
    ({
      "same-order": t("admin.prizeWhySameOrder"),
      unpaid: t("admin.prizeWhyUnpaid"),
      "not-later": t("admin.prizeWhyNotLater"),
      "wrong-owner": t("admin.prizeWhyWrongOwner"),
    })[reason] || t("admin.prizeVerifyUnavailable");

  /* The rows: the server's own list (built from the customer's spin records plus
     any older signed prizes) once it has answered; until then, or if it cannot
     be reached, what the customer's profile says, with redeeming switched off. */
  const rows = !data ? [] : verdicts?.state === "ok" && verdicts.list?.length ? verdicts.list : data.prizes;

  return (
    <details style={box} onToggle={(e) => { if (e.currentTarget.open) load().catch(() => setData({ prizes: [], extras: {}, redeemed: {} })); }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{t("admin.prizesTitle")}</summary>

      {!data ? (
        <div style={{ ...muted, marginTop: 6 }}>{t("admin.prizeChecking")}</div>
      ) : rows.length === 0 ? (
        <div style={{ ...muted, marginTop: 6 }}>{t("admin.prizesNone")}</div>
      ) : (
        rows.map((p) => {
          const verdict = verdicts?.state === "ok" ? verdicts.byCode?.[p.code] : null;
          const done = data.redeemed?.[p.code] || (p.redeemedAt ? { at: p.redeemedAt, orderId: null } : null);
          const extra = data.extras?.[p.code];
          const special = prizeById(p.prizeId)?.special;
          const options = eligibleOrders(p);
          const status =
            verdicts?.state === "loading" ? { c: "#6A5A50", text: t("admin.prizeChecking") }
            : verdicts?.state === "unavailable" ? { c: "#8A5A1F", text: t("admin.prizeVerifyUnavailable") }
            : verdicts?.state === "ok" && !verdicts.secretConfigured ? { c: "#8A2A1F", text: t("admin.prizeNoSecret") }
            : verdict?.valid ? { c: "#3F6B22", text: t("admin.prizeVerified") }
            : { c: "#8A2A1F", text: t("admin.prizeNotVerified") };

          return (
            <div key={p.code} style={{ borderTop: "1px solid #F1ECE3", padding: "10px 0" }}>
              {/* The name comes from the prize id, never from the stored label:
                  the label is text the customer could have edited. */}
              <div>
                <strong>{prizeById(p.prizeId)?.label || p.prizeId}</strong>
                <span style={{ ...muted, marginInlineStart: 8, letterSpacing: ".08em" }}>{p.code}</span>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3 }}>
                <span style={{ color: status.c, fontWeight: 600 }}>{status.text}</span>
                <span style={muted}>
                  {t("admin.prizeWonOn", { order: p.orderId ? orderName(p.orderId) : t("admin.prizeUnknownOrder") })}
                </span>
                {p.validUntil && (
                  <span style={{ color: verdict?.expired ? "#8A2A1F" : "#6A5A50" }}>
                    {t("admin.prizeValidUntil", { date: dmy(p.validUntil) })}
                  </span>
                )}
                {verdict && (
                  <span style={{ color: verdict.redeemable ? "#3F6B22" : "#8A5A1F", fontWeight: 600 }}>
                    {verdict.redeemable ? t("admin.prizeRedeemableYes") : `${t("admin.prizeRedeemableNo")}: ${reasonText(verdict.reason)}`}
                  </span>
                )}
              </div>

              {special && !extra && <div style={{ color: "#8A5A1F", marginTop: 3 }}>{t("admin.prizeAwaiting")}</div>}
              {extra?.type === "team" && (
                <div style={{ marginTop: 6 }}>
                  <div style={muted}>{t("admin.prizeTeamFriends")}</div>
                  <ol style={{ margin: "3px 0 0", paddingInlineStart: 20 }}>
                    {(extra.friends || []).map((f, i) => (
                      <li key={i}>{f.name} <span dir="ltr" style={muted}>{f.contact}</span></li>
                    ))}
                  </ol>
                  {extra.consent && <div style={{ color: "#3F6B22", marginTop: 3 }}>{t("admin.prizeConsentYes")}</div>}
                </div>
              )}
              {extra?.type === "jackpot" && (
                <div style={{ marginTop: 6 }}>
                  <div>{t("admin.prizeJackpotVideo")}: <strong>{extra.video?.label}</strong></div>
                  <div>{t("admin.prizeJackpotPack")}: <strong>{extra.pack?.label}</strong></div>
                </div>
              )}

              {done ? (
                <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: "#3F6B22" }}>
                    {t("admin.prizeRedeemedOnOrder", {
                      order: done.orderId ? orderName(done.orderId) : t("admin.prizeUnknownOrder"),
                      date: new Date(redeemedAt(done)).toLocaleDateString("en-GB"),
                    })}
                  </span>
                  <button className="filter-button" disabled={busy === p.code} onClick={() => undo(p)}>
                    {t("admin.prizeUndoRedeemed")}
                  </button>
                </div>
              ) : verdict?.redeemable ? (
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {options.length === 0 ? (
                    <span style={{ color: "#8A5A1F" }}>{t("admin.prizeNoEligibleOrder")}</span>
                  ) : (
                    <>
                      <label style={muted}>
                        {t("admin.prizeRedeemOn")}{" "}
                        <select
                          value={choice[p.code] || ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [p.code]: e.target.value }))}
                          style={{ padding: "5px 6px", border: "1px solid #D7C9B8", fontSize: 12.5 }}
                        >
                          <option value="">{t("admin.prizeChooseOrder")}</option>
                          {options.map((o) => <option key={o.id} value={o.id}>{o.label || o.id}</option>)}
                        </select>
                      </label>
                      <button
                        className="filter-button"
                        disabled={!choice[p.code] || busy === p.code}
                        style={{ opacity: !choice[p.code] ? 0.5 : 1 }}
                        onClick={() => redeem(p)}
                      >
                        {busy === p.code ? t("admin.prizeChecking") : t("admin.prizeMarkRedeemed")}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              {problem[p.code] && <div style={{ color: "#8A2A1F", marginTop: 4 }}>{problem[p.code]}</div>}
            </div>
          );
        })
      )}
    </details>
  );
}
