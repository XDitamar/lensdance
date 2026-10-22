// src/components/PrizeAdminPanel.jsx
//
// A customer's prize-wheel gifts, for Alina, on the admin registrations page.
//
// The gifts come from users/{uid}/prizes, which only the Cloud Functions can
// write, so a document there IS genuine: there is nothing to "verify". For each
// prize this shows what it is, the order it was won on, when it expires, and
// whether it can be redeemed (and if not, why).
//
// Redeeming is done AGAINST A SPECIFIC LATER ORDER of the same customer: the
// choice only lists orders whose deposit is marked paid, that are not the order
// the prize was won on, and that were placed after it. The reasons shown here
// (src/lib/prizeRules.js) are a display copy; the `redeemPrize` function checks
// everything again on the server inside a transaction, including the rule that
// only a customer's earliest capped prize can ever be redeemed.

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchRewards, redeemPrize, undoRedeem } from "../lib/rewards";
import { checkPrize, checkTarget } from "../lib/prizeRules";
import { dmy, prizeById } from "../config/prizes";

const box = { marginTop: 10, borderTop: "1px solid #EDE8DF", paddingTop: 8, fontFamily: "Arial,sans-serif", fontSize: 12.5, color: "#4A3525" };
const muted = { color: "#6A5A50" };

/**
 * orders: this customer's orders, [{ id, label, depositPaid, submittedAt (ms) }].
 * Kept in the parent's state, so marking a deposit paid updates the choices here.
 */
export default function PrizeAdminPanel({ uid, orders }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);       // { prizes, extras, redeemed }
  const [loadError, setLoadError] = useState("");
  const [choice, setChoice] = useState({});     // prize order id -> chosen order id
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState({});   // prize order id -> message

  // Loaded on first open, not for every row of a long list.
  const load = async () => {
    if (data) return;
    try {
      setData(await fetchRewards(uid, { strict: true }));
      setLoadError("");
    } catch (e) {
      setLoadError(t("common.errorWithCode", { detail: e?.code || e?.message || "" }));
    }
  };

  const orderName = (id) => {
    const o = orders.find((x) => x.id === id);
    return o ? (o.label || id) : id;
  };

  const reasonText = (reason) =>
    ({
      "already-redeemed": t("admin.prizeAlreadyRedeemed"),
      expired: t("admin.prizeExpired"),
      "capped-limit": t("admin.prizeCappedLimit"),
      "same-order": t("admin.prizeWhySameOrder"),
      unpaid: t("admin.prizeWhyUnpaid"),
      "not-later": t("admin.prizeWhyNotLater"),
      "wrong-owner": t("admin.prizeWhyWrongOwner"),
    })[reason] || null;

  /** Later orders of this customer with the deposit paid, other than the winning one. */
  const eligibleOrders = (p) =>
    orders.filter(
      (o) =>
        checkTarget({
          uid,
          prize: p,
          target: { id: o.id, userId: uid, depositPaid: o.depositPaid, submittedAtMs: o.submittedAt },
        }) === null
    );

  const fail = (p, e) =>
    setProblem((m) => ({
      ...m,
      [p.orderId]: reasonText(e?.code) || t("common.errorWithCode", { detail: e?.code || e?.message || "" }),
    }));

  const redeem = async (p) => {
    const onOrderId = choice[p.orderId];
    if (!onOrderId) return;
    setBusy(p.orderId);
    setProblem((m) => ({ ...m, [p.orderId]: "" }));
    try {
      await redeemPrize(uid, p.orderId, onOrderId);
      setData((d) => ({
        ...d,
        prizes: d.prizes.map((x) => (x.orderId === p.orderId ? { ...x, redeemed: { at: Date.now(), orderId: onOrderId, by: "admin" } } : x)),
      }));
    } catch (e) {
      fail(p, e);
    } finally {
      setBusy(null);
    }
  };

  const undo = async (p) => {
    setBusy(p.orderId);
    try {
      await undoRedeem(uid, p.orderId);
      setData((d) => ({ ...d, prizes: d.prizes.map((x) => (x.orderId === p.orderId ? { ...x, redeemed: null } : x)) }));
    } catch (e) {
      fail(p, e);
    } finally {
      setBusy(null);
    }
  };

  const rows = data ? [...data.prizes].sort((a, b) => (a.issuedAt || 0) - (b.issuedAt || 0)) : [];

  return (
    <details style={box} onToggle={(e) => { if (e.currentTarget.open) load(); }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{t("admin.prizesTitle")}</summary>

      {loadError ? (
        <div style={{ color: "#8A2A1F", marginTop: 6 }}>{loadError}</div>
      ) : !data ? (
        <div style={{ ...muted, marginTop: 6 }}>{t("admin.prizeChecking")}</div>
      ) : rows.length === 0 ? (
        <div style={{ ...muted, marginTop: 6 }}>{t("admin.prizesNone")}</div>
      ) : (
        rows.map((p) => {
          const reason = checkPrize({ prize: p, allPrizes: rows });
          const extra = p.extra;
          const special = prizeById(p.prizeId)?.special;
          const options = reason ? [] : eligibleOrders(p);

          return (
            <div key={p.orderId} style={{ borderTop: "1px solid #F1ECE3", padding: "10px 0" }}>
              <div>
                <strong>{prizeById(p.prizeId)?.label || p.prizeId}</strong>
                <span style={{ ...muted, marginInlineStart: 8, letterSpacing: ".08em" }}>{p.code}</span>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3 }}>
                <span style={muted}>{t("admin.prizeWonOn", { order: orderName(p.orderId) })}</span>
                {p.validUntil && (
                  <span style={{ color: reason === "expired" ? "#8A2A1F" : "#6A5A50" }}>
                    {t("admin.prizeValidUntil", { date: dmy(p.validUntil) })}
                  </span>
                )}
                <span style={{ color: reason ? "#8A5A1F" : "#3F6B22", fontWeight: 600 }}>
                  {reason
                    ? `${t("admin.prizeRedeemableNo")}: ${reasonText(reason)}`
                    : t("admin.prizeRedeemableYes")}
                </span>
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

              {p.redeemed ? (
                <div style={{ marginTop: 6, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: "#3F6B22" }}>
                    {t("admin.prizeRedeemedOnOrder", {
                      order: p.redeemed.orderId ? orderName(p.redeemed.orderId) : t("admin.prizeUnknownOrder"),
                      date: new Date(p.redeemed.at || Date.now()).toLocaleDateString("en-GB"),
                    })}
                  </span>
                  <button className="filter-button" disabled={busy === p.orderId} onClick={() => undo(p)}>
                    {t("admin.prizeUndoRedeemed")}
                  </button>
                </div>
              ) : !reason ? (
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {options.length === 0 ? (
                    <span style={{ color: "#8A5A1F" }}>{t("admin.prizeNoEligibleOrder")}</span>
                  ) : (
                    <>
                      <label style={muted}>
                        {t("admin.prizeRedeemOn")}{" "}
                        <select
                          value={choice[p.orderId] || ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [p.orderId]: e.target.value }))}
                          style={{ padding: "5px 6px", border: "1px solid #D7C9B8", fontSize: 12.5 }}
                        >
                          <option value="">{t("admin.prizeChooseOrder")}</option>
                          {options.map((o) => <option key={o.id} value={o.id}>{o.label || o.id}</option>)}
                        </select>
                      </label>
                      <button
                        className="filter-button"
                        disabled={!choice[p.orderId] || busy === p.orderId}
                        style={{ opacity: !choice[p.orderId] ? 0.5 : 1 }}
                        onClick={() => redeem(p)}
                      >
                        {busy === p.orderId ? t("admin.prizeChecking") : t("admin.prizeMarkRedeemed")}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
              {problem[p.orderId] && <div style={{ color: "#8A2A1F", marginTop: 4 }}>{problem[p.orderId]}</div>}
            </div>
          );
        })
      )}
    </details>
  );
}
