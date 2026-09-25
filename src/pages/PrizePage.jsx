// src/pages/PrizePage.jsx
//
// The client's prize wheel — /prize.
//
// Built in the site's own language rather than a fairground's: two shades of
// linen, hairlines in camel, Georgia for anything that carries meaning. The
// polish is not in colour, it is in construction — a rim with pegs, radial
// labels, a weighted hub, and a spin that winds up, runs long and settles.
//
// The wheel NEVER decides anything. It asks api/spin.js, is told the answer,
// and rotates until it arrives there — so what the animation shows and what the
// client actually won cannot come apart.
//
// Copy is Hebrew-only for now, deliberately: the prize names are not final, and
// four languages of keys behind wording that is about to change means
// translating it twice. It moves into src/locales/* before release.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { WHEEL, fetchRewards, recordPrize, requestSpin, spinsLeft } from "../lib/rewards";
import "./prize.css";

const SLICE = 360 / WHEEL.length;
const R_RIM = 150;     // outer rim
const R_FACE = 132;    // the segments themselves
const R_HUB = 46;      // where the labels stop — the hub itself is a DOM
                       // element on top, so that it does not turn with the
                       // wheel (see .prize-hub)
const C = 160;         // centre point
const rad = (deg) => ((deg - 90) * Math.PI) / 180;
const px = (deg, r) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The pegs around the rim — what a pointer would tick against. */
const PEGS = Array.from({ length: 24 }, (_, i) => (i * 360) / 24);

export default function PrizePage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState({ granted: 0, prizes: [] });
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | windup | spinning
  const [won, setWon] = useState(null);
  const [error, setError] = useState("");
  /* The mark in the hub. If the file is not in public/ the wordmark takes its
     place — a missing asset should cost a logo, not leave a hole in the middle
     of the wheel. */
  const [logoOk, setLogoOk] = useState(true);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); if (!u) setLoading(false); }), []);

  useEffect(() => {
    if (!user?.uid) return;
    let on = true;
    fetchRewards(user.uid).then((r) => { if (on) { setRewards(r); setLoading(false); } });
    return () => { on = false; };
  }, [user]);

  const left = useMemo(() => spinsLeft(rewards), [rewards]);
  const busy = phase !== "idle";

  const onSpin = async () => {
    if (busy || left <= 0) return;
    setError("");
    setWon(null);

    let result;
    try {
      // Asked for FIRST, so the wheel never starts a spin it cannot finish —
      // a wheel that turns and then apologises is worse than a button that
      // waits half a second.
      result = await requestSpin();
    } catch (err) {
      setError(err?.message === "not-signed-in" ? "צריך להתחבר" : "משהו השתבש. נסו שוב בעוד רגע.");
      return;
    }

    // Wind-up: a short pull against the direction of travel. It costs 300ms
    // and it is most of what makes the spin feel thrown rather than played.
    setPhase("windup");
    setAngle((a) => a - 10);
    await wait(310);
    if (!alive.current) return;

    /* Six whole turns, then the middle of the winning slice under the marker
       at twelve o'clock. Measured forward from where the wheel already is, so
       a second spin continues rather than snapping back. */
    const target = 360 * 6 - (result.index * SLICE + SLICE / 2);
    setPhase("spinning");
    setAngle((a) => a + (360 - (((a % 360) + 360) % 360)) + target);

    await wait(5500);
    if (!alive.current) return;

    setPhase("idle");
    setWon(result);
    setRewards((r) => ({
      ...r,
      prizes: [...r.prizes, { prizeId: result.prize.id, label: result.prize.label, code: result.code }],
    }));

    // Saved after it is shown: the client has won either way, and a slow write
    // must not hold up the moment they are waiting for.
    recordPrize(user.uid, result).catch((e) => console.warn("Prize not saved:", e?.code || e));
  };

  if (loading) return <div className="prize-page"><p className="prize-muted">טוען…</p></div>;

  if (!user) {
    return (
      <div className="prize-page">
        <h1 className="prize-title">המתנות שלך</h1>
        <p className="prize-muted">צריך להתחבר כדי לראות אותן</p>
        <Link className="prize-btn" to="/login">התחברות</Link>
      </div>
    );
  }

  return (
    <div className="prize-page">
      <p className="prize-eyebrow">מתנה עבורך</p>
      <h1 className="prize-title">תודה על ההזמנה</h1>
      <div className="prize-rule" />
      <p className="prize-lead">סובבו את הגלגל — כל משבצת היא מתנה</p>

      <div className={`prize-stage${won ? " is-won" : ""}`}>
        <svg
          className={`prize-pointer${phase === "spinning" ? " is-ticking" : ""}`}
          width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"
        >
          <path d="M13 33 L3 11 A11 11 0 1 1 23 11 Z" fill="var(--pz-deep)" />
          <circle cx="13" cy="11" r="4" fill="var(--pz-bg)" />
        </svg>

        <div className={`prize-drift${busy || won ? " is-busy" : ""}`}>
          <svg
            className={`prize-wheel${phase === "windup" ? " is-windup" : ""}${phase === "spinning" ? " is-spinning" : ""}`}
            viewBox="0 0 320 320"
            style={{ transform: `rotate(${angle}deg)` }}
            role="img"
            aria-label="גלגל המתנות"
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
              const isWinner = won?.prize?.id === prize.id;
              // Labels run along the radius. Flipped on the left half so no
              // word is ever read upside down.
              const flip = mid > 180;
              const rotation = flip ? mid + 90 : mid - 90;
              const [lx, ly] = px(mid, (R_FACE + R_HUB) / 2);
              return (
                <g key={prize.id}>
                  <path
                    className={`prize-slice${isWinner ? " is-winner" : ""}`}
                    d={`M${C} ${C} L${x1} ${y1} A${R_FACE} ${R_FACE} 0 0 1 ${x2} ${y2} Z`}
                    fill={i % 2 === 0 ? "var(--pz-slice-a)" : "var(--pz-slice-b)"}
                    stroke="var(--pz-camel)"
                    strokeWidth="0.6"
                  />
                  <text
                    x={lx} y={ly}
                    transform={`rotate(${rotation} ${lx} ${ly})`}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="Georgia, serif"
                    fontSize="11.5"
                    fill="var(--pz-label)"
                    letterSpacing="0.4"
                  >
                    {prize.label}
                  </text>
                </g>
              );
            })}

            <circle cx={C} cy={C} r={R_FACE} fill="none" stroke="var(--pz-camel)" strokeWidth="1" />
          </svg>
        </div>

        {/* The hub sits OUTSIDE the turning svg, on top of it.
            Inside, it span with the wheel — six rotations of Alina's logo,
            which is both dizzying and wrong: a maker's mark is the still point
            a wheel turns around, not another thing being flung about. Out here
            it also stops being clipped by the wheel's geometry, which is what
            was cutting the monogram in half. */}
        <div className="prize-hub" aria-hidden="true">
          {logoOk ? (
            <>
              <img className="prize-logo-light" src="/logo-hub.png" alt=""
                   onError={() => setLogoOk(false)} />
              <img className="prize-logo-dark" src="/logo-hub-white.png" alt="" />
            </>
          ) : (
            <span className="prize-hub-word">לנס<br />דאנס</span>
          )}
        </div>
      </div>

      {left > 0 ? (
        <>
          <button className="prize-btn prize-btn-solid" onClick={onSpin} disabled={busy}>
            {busy ? "מסובב…" : "סובבו"}
          </button>
          <p className="prize-count">{left === 1 ? "נותר לך סיבוב אחד" : `נותרו לך ${left} סיבובים`}</p>
        </>
      ) : (
        <p className="prize-count">
          {rewards.prizes.length > 0 ? "השתמשת בכל הסיבובים שלך" : "עדיין אין לך סיבובים"}
        </p>
      )}

      {error && <p className="prize-error">{error}</p>}

      {won && (
        <div className="prize-card">
          <p className="prize-eyebrow">זכית</p>
          <h2 className="prize-won">{won.prize.label}</h2>
          <p className="prize-muted">{WHEEL.find((p) => p.id === won.prize.id)?.note}</p>
          <div className="prize-code">{won.code}</div>
          <p className="prize-fine">הקוד שמור אצלך כאן — הראי אותו לאלינה כדי לממש</p>
        </div>
      )}

      {rewards.prizes.length > 0 && (
        <div className="prize-list">
          <p className="prize-eyebrow">המתנות שלך</p>
          {rewards.prizes.map((p) => (
            <div key={p.code} className="prize-row">
              <span>{p.label}</span>
              <span className="prize-row-code">{p.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
