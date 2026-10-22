// src/pages/PrizePage.jsx
//
// The client's prize wheel: /prize.
//
// Built in the site's own language: two shades of linen, hairlines in camel,
// Georgia for anything that carries meaning. The polish is in the construction
// (a rim with pegs, radial labels, a still hub) and in the motion: a short
// wind-up, a long spin that decelerates, a settle.
//
// The wheel NEVER decides anything. It asks api/spin.js, is told the answer,
// and rotates until it arrives there, so what the animation shows and what the
// client actually won cannot come apart.
//
// ODDS ARE NOT ON THIS PAGE, on purpose: no percentages and no "rare" or
// "common" wording anywhere here. They are published in the rules page
// (/prize-terms), generated from the same weights the server draws with, and
// this page links to it from the small print and from the result. Rarity
// (`tier`) only decides how much celebration the reveal gets.
//
// ONE SPIN PER ORDER. /prize?order=<registrationId> is the wheel for that order:
// if the order has no prize yet it can be spun (no deposit needed), otherwise
// the prize it already won is shown, parked under the pointer. /prize with no
// order lists the orders still waiting for a spin. The prize is a pure function
// of the order (api/spin.js), so there is nothing to reroll, and it can only be
// redeemed later, on another order whose deposit is paid (see src/lib/rewards.js
// and the admin registrations page).
//
// The prize table is src/config/prizes.js (a generated copy of
// api/_prizes.js). All copy is in src/locales/*.json under `prize`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import {
  WHEEL,
  fetchRewards,
  fetchWheelOrders,
  orderStates,
  recordPrize,
  requestSpin,
  spinErrorKey,
  submitPrizeExtra,
  validateJackpot,
  validateTeam,
} from "../lib/rewards";
import { PRIZE_VALID_UNTIL, PRIZE_WHEEL_UNTIL, dmy, isExpired, prizeById, wheelOpen } from "../config/prizes";
import { competitionLabel, fetchCompetitions, hasEnded } from "../lib/competitions";
import "./prize.css";

const SLICE = 360 / WHEEL.length;
const R_RIM = 150;     // outer rim
const R_FACE = 132;    // the segments themselves
const R_HUB = 46;      // where the labels stop; the hub itself is a DOM element
                       // on top, so that it does not turn with the wheel
const C = 160;         // centre point
const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const px = (deg, r) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The pegs around the rim, what a pointer would tick against. */
const PEGS = Array.from({ length: 24 }, (_, i) => (i * 360) / 24);

/**
 * A wedge as a clip-path polygon, in % of the wheel's box, so that a plain
 * <button> can be exactly one slice (clipping also clips where it can be
 * tapped). The face is R_FACE of a 320-unit box.
 */
const wedge = (i) => {
  const r = (R_FACE / 320) * 100;
  const pts = [[50, 50]];
  for (let k = 0; k <= 4; k += 1) {
    const deg = i * SLICE + (SLICE * k) / 4;
    pts.push([50 + r * Math.sin((deg * Math.PI) / 180), 50 - r * Math.cos((deg * Math.PI) / 180)]);
  }
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`;
};
const WEDGES = WHEEL.map((_, i) => wedge(i));

/**
 * Split a short label over at most two lines, as evenly as the words allow,
 * so that a two-word name fits the narrow end of a slice.
 */
function lines(label) {
  const words = String(label).split(" ");
  if (words.length < 2) return [label];
  let best = [label];
  let bestMax = Infinity;
  for (let k = 1; k < words.length; k += 1) {
    const pair = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const max = Math.max(pair[0].length, pair[1].length);
    if (max < bestMax) { best = pair; bestMax = max; }
  }
  return best;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isWide = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(min-width: 1024px)").matches;

export default function PrizePage() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const orderParam = params.get("order");
  /* /prize?test=1 shows a "test spin" button. It only reveals a button: the
     server (api/spin.js) decides who may use it, so the parameter is no key. */
  const testMode = params.get("test") === "1";
  const [rewards, setRewards] = useState({ prizes: [], extras: {}, redeemed: {} });
  /* The customer's orders. null until read; [] when they have none (or the
     read failed, which is treated the same: nothing to spin for). */
  const [orders, setOrders] = useState(null);
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | windup | spinning
  const [won, setWon] = useState(null);
  const [error, setError] = useState("");
  const [endedState, setEnded] = useState(!wheelOpen());
  /* Past 31.12.2026 the wheel is closed to customers. In test mode it stays
     visible so it can still be checked (the server decides who may spin). */
  const ended = endedState && !testMode;
  /* The slice being looked at (hovered, tapped or focused). */
  const [peek, setPeek] = useState(null);
  /* Which slice holds the single tab stop (arrow keys move it). */
  const [rove, setRove] = useState(0);
  /* "What can I win": open on desktop, collapsed on a phone. */
  const [canOpen, setCanOpen] = useState(isWide);
  /* The mark in the hub. If the file is not in public/ the wordmark takes its
     place: a missing asset should cost a logo, not leave a hole in the middle
     of the wheel. */
  const [logoOk, setLogoOk] = useState(true);
  const alive = useRef(true);
  const hitRefs = useRef([]);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); if (!u) setLoading(false); }), []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let on = true;
    Promise.all([
      fetchRewards(user.uid),
      fetchWheelOrders(user.uid).catch((e) => { console.warn("Could not read orders:", e?.code || e); return []; }),
    ]).then(([r, o]) => { if (on) { setRewards(r); setOrders(o); setLoading(false); } });
    return () => { on = false; };
  }, [user]);

  const states = useMemo(() => orderStates(orders || [], rewards.prizes), [orders, rewards.prizes]);
  const selected = orderParam ? states.find((o) => o.id === orderParam) || null : null;
  const waiting = states.filter((o) => o.spinnable);
  const canSpin = !!selected?.spinnable;
  /* What the result card shows: the prize just won, or, when an order that was
     already spun is opened, the prize it won earlier. */
  const shown = won || (selected?.prize
    ? { prize: { id: selected.prize.prizeId, tier: selected.prize.tier }, code: selected.prize.code, validUntil: selected.prize.validUntil }
    : null);
  const dateOf = (ms) => (ms ? new Date(ms).toLocaleDateString(i18n.language) : "");

  /* An order that was spun before is parked on its prize, so the wheel and the
     card agree on a reload. The angle that puts that slice under the pointer. */
  const parkedIndex = selected?.prize ? WHEEL.findIndex((p) => p.id === selected.prize.prizeId) : -1;
  useEffect(() => {
    if (parkedIndex >= 0 && !won && phase === "idle") setAngle(-(parkedIndex * SLICE + SLICE / 2));
  }, [parkedIndex, won, phase]);
  const busy = phase !== "idle";
  const prizeName = useCallback(
    (id, fallback) => t(`prize.items.${id}.label`, { defaultValue: fallback || "" }),
    [t]
  );
  const explain = useCallback((id) => t(`prize.items.${id}.explain`, { defaultValue: "" }), [t]);

  const onSpin = async (test = false) => {
    if (busy || (!test && !canSpin)) return;
    setError("");
    setWon(null);
    setPeek(null);

    let result;
    try {
      // Asked for FIRST, so the wheel never starts a spin it cannot finish:
      // a wheel that turns and then apologises is worse than a button that
      // waits half a second.
      result = await requestSpin(selected?.id, { test });
    } catch (err) {
      if (err?.code === "wheel-ended") setEnded(true);
      // Each cause gets its own plain-language message (see spinErrorKey);
      // the technical code stays in the console for whoever is debugging.
      console.warn("Spin failed:", err?.code || err);
      const key = spinErrorKey(err);
      // The catch-all message says nothing about the cause, so for that case
      // (and only that case) the short technical code goes at the end. It lets a
      // customer read it out to Alina, and Itamar see what the server answered
      // without opening devtools. The mapped messages are already specific.
      const tail = key === "errorGeneric" && err?.code ? ` (${String(err.code).slice(0, 40)})` : "";
      setError(`${t(`prize.${key}`)}${tail}`);
      return;
    }

    /* Whole turns, then the middle of the winning slice under the marker at
       twelve o'clock. Measured forward from where the wheel already is, so a
       second spin continues rather than snapping back. */
    const target = 360 * 6 - (result.index * SLICE + SLICE / 2);
    const forward = (a) => a + (360 - (((a % 360) + 360) % 360)) + target;

    if (prefersReducedMotion()) {
      // No wind-up, no turns: land on the answer and show it.
      setAngle(forward);
    } else {
      // Wind-up: a short pull against the direction of travel. It costs 300ms
      // and it is most of what makes the spin feel thrown rather than played.
      setPhase("windup");
      setAngle((a) => a - 10);
      await wait(310);
      if (!alive.current) return;
      setPhase("spinning");
      setAngle(forward);
      await wait(5500);
      if (!alive.current) return;
    }

    setPhase("idle");
    setWon(result);

    // A test spin is shown and nothing more: not added to the customer's prizes,
    // not written to Firestore, no follow-up forms.
    if (result.test) return;

    setRewards((r) => ({
      ...r,
      prizes: [
        ...r.prizes,
        {
          prizeId: result.prize.id,
          label: result.prize.label,
          tier: result.prize.tier,
          code: result.code,
          issuedAt: result.issuedAt,
          validUntil: result.validUntil,
          orderId: result.orderId,
          signature: result.signature,
        },
      ],
    }));

    // Saved after it is shown: the client has won either way, and a slow write
    // must not hold up the moment they are waiting for.
    recordPrize(user.uid, result).catch((e) => console.warn("Prize not saved:", e?.code || e));
  };

  /* Arrow keys move between slices (one tab stop for the whole wheel, not
     eleven). Right/Down go forward, Left/Up back, in any text direction. */
  const onHitKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (i + step + WHEEL.length) % WHEEL.length;
    setRove(next);
    hitRefs.current[next]?.focus();
  };

  if (loading) {
    return <div className="prize-page"><p className="prize-muted">{t("prize.loading")}</p></div>;
  }

  if (!user) {
    return (
      <div className="prize-page">
        <h1 className="prize-title">{t("prize.loginTitle")}</h1>
        <p className="prize-muted">{t("prize.loginBody")}</p>
        <Link className="prize-btn" to="/login">{t("prize.login")}</Link>
      </div>
    );
  }

  const pending = rewards.prizes.filter(
    (p) => prizeById(p.prizeId)?.special && !rewards.extras?.[p.code]
  );
  const wonTier = shown?.prize?.tier || "common";
  const peeked = peek !== null ? WHEEL[peek] : null;

  return (
    <div className="prize-page">
      <div className={`prize-layout${ended ? " is-ended" : ""}`}>
        <header className="prize-intro">
          <p className="prize-eyebrow">{t("prize.eyebrow")}</p>
          <h1 className="prize-title">{t("prize.title")}</h1>
          <div className="prize-rule" />
          {!ended && <p className="prize-lead">{t("prize.lead")}</p>}
        </header>

        {ended ? (
          <section className="prize-ended">
            <h2 className="prize-ended-title">{t("prize.endedTitle")}</h2>
            <p className="prize-muted">{t("prize.endedBody", { date: dmy(PRIZE_WHEEL_UNTIL) })}</p>
          </section>
        ) : (
          <>
            {/* The wheel is a picture (aria-hidden). Everything it says is also
                real text: the "what can I win" list below, the slice buttons
                laid over it, and the announcement of the result. */}
            <div className="prize-stagecol">
              <div className={`prize-stage${won ? ` is-won tier-${wonTier}` : ""}`}>
                <svg
                  className="prize-pointer"
                  width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"
                >
                  <path d="M13 33 L3 11 A11 11 0 1 1 23 11 Z" fill="var(--pz-deep)" />
                  <circle cx="13" cy="11" r="4" fill="var(--pz-bg)" />
                </svg>

                <svg
                  className={`prize-wheel${phase === "windup" ? " is-windup" : ""}${phase === "spinning" ? " is-spinning" : ""}`}
                  viewBox="0 0 320 320"
                  style={{ transform: `rotate(${angle}deg)` }}
                  aria-hidden="true"
                  focusable="false"
                >
                  <circle cx={C} cy={C} r={R_RIM} fill="var(--pz-rim)" stroke="var(--pz-camel)" strokeWidth="1" />
                  <circle cx={C} cy={C} r={R_FACE + 8} fill="none" stroke="var(--pz-camel)" strokeWidth="0.75" opacity="0.5" />

                  {PEGS.map((deg) => {
                    const [x, y] = px(deg, (R_RIM + R_FACE) / 2 + 3);
                    return <circle key={deg} cx={x} cy={y} r="2.1" fill="var(--pz-camel)" opacity="0.65" />;
                  })}

                  {WHEEL.map((prize, i) => {
                    const start = i * SLICE;
                    const end = start + SLICE;
                    const [x1, y1] = px(start, R_FACE);
                    const [x2, y2] = px(end, R_FACE);
                    const mid = start + SLICE / 2;
                    const isWinner = shown?.prize?.id === prize.id;
                    const isPeek = peek === i && !isWinner;
                    const isJackpot = prize.tier === "jackpot";
                    // Labels run along the radius. Flipped on the left half so no
                    // word is ever read upside down.
                    const flip = mid > 180;
                    const rotation = flip ? mid + 90 : mid - 90;
                    const [lx, ly] = px(mid, (R_FACE + R_HUB) / 2 + 4);
                    const rows = lines(t(`prize.items.${prize.id}.short`));
                    /* Eleven slices is odd, so strict alternation would put two
                       of the same linen side by side where the wheel closes. The
                       jackpot takes that seat in a deep brown: it is also the
                       one slice that should be easy to find. */
                    const fill = isJackpot
                      ? "var(--pz-jackpot)"
                      : i % 2 === 0 ? "var(--pz-slice-a)" : "var(--pz-slice-b)";
                    return (
                      <g key={prize.id}>
                        <path
                          className={`prize-slice${isWinner ? " is-winner" : ""}${isPeek ? " is-peek" : ""}`}
                          d={`M${C} ${C} L${x1} ${y1} A${R_FACE} ${R_FACE} 0 0 1 ${x2} ${y2} Z`}
                          fill={isWinner || isPeek ? undefined : fill}
                          stroke="var(--pz-camel)"
                          strokeWidth="0.6"
                        />
                        <text
                          transform={`rotate(${rotation} ${lx} ${ly})`}
                          textAnchor="middle"
                          fontFamily="Georgia, serif"
                          fontSize="11.5"
                          fill={isWinner ? "var(--pz-win-label)" : isJackpot && !isPeek ? "var(--pz-on-jackpot)" : "var(--pz-label)"}
                          letterSpacing="0.2"
                        >
                          {rows.map((row, k) => (
                            <tspan
                              key={k}
                              x={lx}
                              y={ly}
                              dy={k === 0 ? `${0.35 - (rows.length - 1) * 0.55}em` : `${0.35 + 0.55 * (rows.length - 1)}em`}
                            >
                              {row}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  })}

                  <circle cx={C} cy={C} r={R_FACE} fill="none" stroke="var(--pz-camel)" strokeWidth="1" />
                </svg>

                {/* One transparent button per slice, turning with the wheel
                    (same angle, same transition), so a slice can be tapped,
                    hovered or reached with the keyboard wherever it stopped.
                    While it is spinning they are switched off. */}
                <div
                  className={`prize-hits${phase === "windup" ? " is-windup" : ""}${phase === "spinning" ? " is-spinning" : ""}`}
                  style={{ transform: `rotate(${angle}deg)` }}
                  role="group"
                  aria-label={t("prize.canWin")}
                >
                  {WHEEL.map((prize, i) => (
                    <button
                      key={prize.id}
                      type="button"
                      ref={(el) => { hitRefs.current[i] = el; }}
                      className="prize-hit"
                      style={{ clipPath: WEDGES[i] }}
                      disabled={busy}
                      tabIndex={rove === i ? 0 : -1}
                      aria-label={`${t(`prize.items.${prize.id}.short`)}. ${explain(prize.id)}`}
                      onClick={() => { setPeek(i); setRove(i); }}
                      onMouseEnter={() => setPeek(i)}
                      onMouseLeave={() => setPeek(null)}
                      onFocus={() => { setPeek(i); setRove(i); }}
                      onBlur={() => setPeek((p) => (p === i ? null : p))}
                      onKeyDown={(e) => onHitKey(e, i)}
                    />
                  ))}
                </div>

                {/* A maker's mark is the still point a wheel turns around, not
                    another thing being flung about: it sits OUTSIDE the turning
                    layers, on top. */}
                <div className="prize-hub" aria-hidden="true">
                  {logoOk ? (
                    <>
                      <img className="prize-logo-light" src="/logo-hub.png" alt=""
                           onError={() => setLogoOk(false)} />
                      <img className="prize-logo-dark" src="/logo-hub-white.png" alt="" />
                    </>
                  ) : (
                    <span className="prize-hub-word">LENS<br />DANCE</span>
                  )}
                </div>
              </div>

            </div>

            {/* What the looked-at slice is. Fixed height, so reading it never
                moves the page. Not a live region: a screen reader already
                gets the same text from the slice button's own label. */}
            <p className={`prize-peek${peeked ? " has-peek" : ""}`}>
              {peeked ? (
                <>
                  <strong>{t(`prize.items.${peeked.id}.short`)}</strong>
                  <span>{explain(peeked.id)}</span>
                </>
              ) : (
                <span>{t("prize.hint")}</span>
              )}
            </p>

            <div className="prize-action">
              {canSpin ? (
                <>
                  <button type="button" className="prize-btn prize-btn-solid" onClick={() => onSpin(false)} disabled={busy}>
                    {busy ? t("prize.spinning") : t("prize.spin")}
                  </button>
                  <p className="prize-count">{t("prize.orderReady", { order: selected.label || dateOf(selected.submittedAt) })}</p>
                </>
              ) : selected ? (
                <p className="prize-count">
                  {selected.prize ? t("prize.alreadySpun") : t("prize.errorOrderLate")}
                </p>
              ) : (
                <>
                  {orderParam && orders && <p className="prize-count prize-count-warn">{t("prize.errorOrderNotFound")}</p>}
                  {waiting.length > 0 ? (
                    <div className="prize-orders">
                      <p className="prize-count">{t("prize.ordersWaiting", { count: waiting.length })}</p>
                      <ul>
                        {waiting.map((o) => (
                          <li key={o.id}>
                            <span>
                              <strong>{o.label || t("prize.order")}</strong>
                              <small>{dateOf(o.submittedAt)}</small>
                            </span>
                            <Link className="prize-btn prize-btn-solid prize-btn-small" to={`/prize?order=${o.id}`}>
                              {t("prize.spin")}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <>
                      <p className="prize-count">{t("prize.noOrders")}</p>
                      <Link className="prize-link" to="/register">{t("prize.toRegister")}</Link>
                    </>
                  )}
                </>
              )}
              {testMode && (
                <div className="prize-test">
                  <button type="button" className="prize-btn prize-btn-small" onClick={() => onSpin(true)} disabled={busy}>
                    {busy ? t("prize.spinning") : t("prize.test.button")}
                  </button>
                  <p className="prize-count">{t("prize.test.hint")}</p>
                </div>
              )}
              <p className="prize-until">{t("prize.until", { date: dmy(PRIZE_WHEEL_UNTIL) })}</p>
            </div>
          </>
        )}

        {/* Announced once, politely, when the answer arrives. */}
        <div className="prize-sr" role="status" aria-live="polite">
          {won ? t("prize.announce", { prize: explain(won.prize.id) || prizeName(won.prize.id, won.prize.label) }) : ""}
        </div>

        <div className="prize-result">
          {error && <p className="prize-error" role="alert">{error}</p>}

          {shown && (
            <div className={`prize-card tier-${wonTier}`}>
              <p className="prize-eyebrow">{t("prize.won")}</p>
              <h2 className="prize-won">{explain(shown.prize.id) || prizeName(shown.prize.id, shown.prize.label)}</h2>
              <div className="prize-code">{shown.code}</div>
              <p className="prize-fine">
                {t("prize.validUntil", { date: dmy(shown.validUntil || PRIZE_VALID_UNTIL) })}
              </p>
              {shown.test ? (
                <p className="prize-fine">{t("prize.test.note")}</p>
              ) : (
                <>
                  <p className="prize-fine">{t("prize.redeemNote")}</p>
                  <p className="prize-fine">{t("prize.codeNote")}</p>
                </>
              )}
              <p className="prize-fine"><Link className="prize-link" to="/prize-terms">{t("prize.rulesLink")}</Link></p>
            </div>
          )}
        </div>

        {!ended && (
          <details
            className="prize-can"
            open={canOpen}
            onToggle={(e) => setCanOpen(e.currentTarget.open)}
          >
            <summary>{t("prize.canWin")}</summary>
            <ul>
              {WHEEL.map((p) => (
                <li key={p.id}>
                  <strong>{t(`prize.items.${p.id}.short`)}</strong>
                  <span>{explain(p.id)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {pending.map((p) => (
        <ExtraForm
          key={p.code}
          prize={p}
          uid={user.uid}
          onDone={(extra) =>
            setRewards((r) => ({ ...r, extras: { ...r.extras, [p.code]: extra } }))
          }
        />
      ))}

      {rewards.prizes.length > 0 && (
        <section className="prize-list" aria-labelledby="prize-mine">
          <h2 id="prize-mine" className="prize-eyebrow">{t("prize.yourPrizes")}</h2>
          <ul>
            {rewards.prizes.map((p) => {
              const redeemed = !!rewards.redeemed?.[p.code];
              const needsDetails = prizeById(p.prizeId)?.special && !rewards.extras?.[p.code];
              const expired = !redeemed && isExpired(p.validUntil);
              return (
                <li key={p.code} className="prize-row">
                  <span className="prize-row-main">
                    <span>{prizeName(p.prizeId, p.label)}</span>
                    <span className="prize-row-state">
                      {redeemed ? t("prize.redeemed")
                        : expired ? t("prize.expired")
                        : needsDetails ? t("prize.pending")
                        : p.validUntil ? t("prize.validUntil", { date: dmy(p.validUntil) }) : ""}
                    </span>
                  </span>
                  <span className="prize-row-code">{p.code}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* TODO: legal review. A prize wheel tied to a purchase may count as a
          promotion under Israeli law and may need a published terms document
          (and possibly a permit). This is plain disclosure, not reviewed text.
          No percentages here: the odds are in /prize-terms, linked below. */}
      <section className="prize-small" aria-labelledby="prize-small-title">
        <h2 id="prize-small-title" className="prize-small-title">{t("prize.fine.title")}</h2>
        <ul>
          <li>{t("prize.fine.until", { date: dmy(PRIZE_WHEEL_UNTIL) })}</li>
          <li>{t("prize.fine.oncePerOrder")}</li>
          <li>{t("prize.fine.redeemLater")}</li>
          <li>{t("prize.fine.noCash")}</li>
          <li>{t("prize.fine.validity", { date: dmy(PRIZE_VALID_UNTIL) })}</li>
          <li>{t("prize.fine.capped")}</li>
          <li>{t("prize.fine.confirm")}</li>
        </ul>
        <p><Link className="prize-link" to="/prize-terms">{t("prize.rulesLink")}</Link></p>
      </section>
    </div>
  );
}

/* ── Follow-ups for the two prizes that need the winner to choose ─────────── */

function ExtraForm({ prize, uid, onDone }) {
  const kind = prizeById(prize.prizeId)?.special;
  return (
    <section className="prize-card prize-form-card">
      <p className="prize-eyebrow">{prize.code}</p>
      {kind === "team" ? (
        <TeamForm code={prize.code} uid={uid} onDone={onDone} />
      ) : (
        <JackpotForm code={prize.code} uid={uid} onDone={onDone} />
      )}
    </section>
  );
}

const ERR_KEYS = { consent: "errConsent", count: "errIncomplete", incomplete: "errIncomplete", contact: "errContact", duplicate: "errDuplicate", same: "errSame" };

function TeamForm({ code, uid, onDone }) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState(() => Array.from({ length: 5 }, () => ({ name: "", contact: "" })));
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (i, field, value) =>
    setFriends((list) => list.map((f, n) => (n === i ? { ...f, [field]: value } : f)));

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateTeam(friends, consent);
    if (problem) { setErr(t(`prize.team.${ERR_KEYS[problem]}`)); return; }
    setErr("");
    setSaving(true);
    try {
      const extra = {
        type: "team",
        friends: friends.map((f) => ({ name: f.name.trim(), contact: f.contact.trim() })),
        consent: true,
      };
      await submitPrizeExtra(uid, code, extra);
      onDone(extra);
    } catch (e2) {
      setErr(e2?.message === "already-submitted" ? t("prize.team.errAlready") : t("prize.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="prize-won">{t("prize.team.title")}</h2>
      <p className="prize-muted">{t("prize.team.lead")}</p>
      {friends.map((f, i) => (
        <fieldset key={i} className="prize-friend">
          <legend>{t("prize.team.friend", { n: i + 1 })}</legend>
          <label>
            <span>{t("prize.team.name")}</span>
            <input type="text" value={f.name} autoComplete="off" onChange={(e) => set(i, "name", e.target.value)} />
          </label>
          <label>
            <span>{t("prize.team.contact")}</span>
            <input type="text" value={f.contact} autoComplete="off" dir="ltr" onChange={(e) => set(i, "contact", e.target.value)} />
          </label>
        </fieldset>
      ))}
      <label className="prize-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t("prize.team.consent")}</span>
      </label>
      {err && <p className="prize-error" role="alert">{err}</p>}
      <button type="submit" className="prize-btn prize-btn-solid" disabled={saving}>
        {saving ? t("prize.team.sending") : t("prize.team.submit")}
      </button>
    </form>
  );
}

function JackpotForm({ code, uid, onDone }) {
  const { t } = useTranslation();
  const [comps, setComps] = useState(null);
  const [video, setVideo] = useState("");
  const [pack, setPack] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let on = true;
    fetchCompetitions()
      .then((list) => { if (on) setComps(list.filter((c) => !hasEnded(c))); })
      .catch(() => { if (on) setComps([]); });
    return () => { on = false; };
  }, []);

  const byId = (id) => comps?.find((c) => c.id === id);

  const submit = async (e) => {
    e.preventDefault();
    const problem = validateJackpot(video, pack);
    if (problem) { setErr(t(`prize.jackpot.${problem === "same" ? "errSame" : "errIncomplete"}`)); return; }
    setErr("");
    setSaving(true);
    try {
      const pick = (id) => ({ id, label: competitionLabel(byId(id)) });
      const extra = { type: "jackpot", video: pick(video), pack: pick(pack) };
      await submitPrizeExtra(uid, code, extra);
      onDone(extra);
    } catch (e2) {
      setErr(e2?.message === "already-submitted" ? t("prize.jackpot.errAlready") : t("prize.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="prize-won">{t("prize.jackpot.title")}</h2>
      <p className="prize-muted">{t("prize.jackpot.lead")}</p>
      {comps === null ? (
        <p className="prize-muted">{t("prize.loading")}</p>
      ) : comps.length < 2 ? (
        <p className="prize-muted">{t("prize.jackpot.noComps")}</p>
      ) : (
        <>
          {[["video", video, setVideo, pack], ["pack", pack, setPack, video]].map(([key, value, setValue, other]) => (
            <label key={key} className="prize-field">
              <span>{t(`prize.jackpot.${key}`)}</span>
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">{t("prize.jackpot.choose")}</option>
                {comps.map((c) => (
                  /* The other pick is not offered, so "not both in the same
                     competition" is enforced by the control and re-checked
                     in validateJackpot. */
                  <option key={c.id} value={c.id} disabled={c.id === other}>{competitionLabel(c)}</option>
                ))}
              </select>
            </label>
          ))}
          {err && <p className="prize-error" role="alert">{err}</p>}
          <button type="submit" className="prize-btn prize-btn-solid" disabled={saving}>
            {saving ? t("prize.jackpot.sending") : t("prize.jackpot.submit")}
          </button>
        </>
      )}
    </form>
  );
}
