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
// The prize table (labels, odds, tiers) is src/config/prizes.js, mirrored from
// api/_prizes.js. All copy is in src/locales/*.json under `prize`.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import {
  WHEEL,
  fetchRewards,
  recordPrize,
  requestSpin,
  spinsLeft,
  submitPrizeExtra,
  validateJackpot,
  validateTeam,
} from "../lib/rewards";
import { PRIZE_WHEEL_UNTIL, TOTAL_WEIGHT, prizeById, wheelOpen } from "../config/prizes";
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

/** 2026-12-31 -> 31.12.2026 (numeric, so it reads the same in every language). */
const untilLabel = () => PRIZE_WHEEL_UNTIL.split("-").reverse().join(".");

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function PrizePage() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState({ granted: 0, prizes: [], extras: {}, redeemed: {} });
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | windup | spinning
  const [won, setWon] = useState(null);
  const [error, setError] = useState("");
  const [ended, setEnded] = useState(!wheelOpen());
  /* The mark in the hub. If the file is not in public/ the wordmark takes its
     place: a missing asset should cost a logo, not leave a hole in the middle
     of the wheel. */
  const [logoOk, setLogoOk] = useState(true);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); if (!u) setLoading(false); }), []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let on = true;
    fetchRewards(user.uid).then((r) => { if (on) { setRewards(r); setLoading(false); } });
    return () => { on = false; };
  }, [user]);

  const left = useMemo(() => spinsLeft(rewards), [rewards]);
  const busy = phase !== "idle";
  const prizeName = useCallback(
    (id, fallback) => t(`prize.items.${id}.label`, { defaultValue: fallback || "" }),
    [t]
  );
  const pct = (weight) =>
    `${((weight / TOTAL_WEIGHT) * 100).toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%`;

  const onSpin = async () => {
    if (busy || left <= 0) return;
    setError("");
    setWon(null);

    let result;
    try {
      // Asked for FIRST, so the wheel never starts a spin it cannot finish:
      // a wheel that turns and then apologises is worse than a button that
      // waits half a second.
      result = await requestSpin();
    } catch (err) {
      if (err?.message === "wheel-ended") setEnded(true);
      setError(
        err?.message === "not-signed-in" ? t("prize.errorSignedOut")
          : err?.message === "wheel-ended" ? t("prize.errorEnded")
          : t("prize.errorGeneric")
      );
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
        },
      ],
    }));

    // Saved after it is shown: the client has won either way, and a slow write
    // must not hold up the moment they are waiting for.
    recordPrize(user.uid, result).catch((e) => console.warn("Prize not saved:", e?.code || e));
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
  const wonTier = won?.prize?.tier || "common";

  return (
    <div className="prize-page">
      <p className="prize-eyebrow">{t("prize.eyebrow")}</p>
      <h1 className="prize-title">{t("prize.title")}</h1>
      <div className="prize-rule" />

      {ended ? (
        <section className="prize-ended">
          <h2 className="prize-ended-title">{t("prize.endedTitle")}</h2>
          <p className="prize-muted">{t("prize.endedBody", { date: untilLabel() })}</p>
        </section>
      ) : (
        <>
          <p className="prize-lead">{t("prize.lead")}</p>

          {/* The wheel is a picture; the prizes are listed as text further down
              (and announced when won), so none of it is lost to a screen reader. */}
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
                const isWinner = won?.prize?.id === prize.id;
                const isJackpot = prize.tier === "jackpot";
                // Labels run along the radius. Flipped on the left half so no
                // word is ever read upside down.
                const flip = mid > 180;
                const rotation = flip ? mid + 90 : mid - 90;
                const [lx, ly] = px(mid, (R_FACE + R_HUB) / 2 + 4);
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
                      className={`prize-slice${isWinner ? " is-winner" : ""}`}
                      d={`M${C} ${C} L${x1} ${y1} A${R_FACE} ${R_FACE} 0 0 1 ${x2} ${y2} Z`}
                      fill={isWinner ? undefined : fill}
                      stroke="var(--pz-camel)"
                      strokeWidth="0.6"
                    />
                    <text
                      x={lx} y={ly}
                      transform={`rotate(${rotation} ${lx} ${ly})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily="Georgia, serif"
                      fontSize="12"
                      fill={isWinner ? "var(--pz-win-label)" : isJackpot ? "var(--pz-on-jackpot)" : "var(--pz-label)"}
                      letterSpacing="0.3"
                    >
                      {t(`prize.items.${prize.id}.short`)}
                    </text>
                  </g>
                );
              })}

              <circle cx={C} cy={C} r={R_FACE} fill="none" stroke="var(--pz-camel)" strokeWidth="1" />
            </svg>

            {/* The hub sits OUTSIDE the turning svg, on top of it: a maker's
                mark is the still point a wheel turns around, not another thing
                being flung about. */}
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

          <div className="prize-action">
            {left > 0 ? (
              <button type="button" className="prize-btn prize-btn-solid" onClick={onSpin} disabled={busy}>
                {busy ? t("prize.spinning") : t("prize.spin")}
              </button>
            ) : null}
            <p className="prize-count">
              {left > 1 ? t("prize.spinsMany", { count: left })
                : left === 1 ? t("prize.spinsOne")
                : rewards.prizes.length > 0 ? t("prize.usedAll")
                : t("prize.noSpins")}
            </p>
            {left === 0 && rewards.prizes.length === 0 && (
              <p className="prize-fine prize-fine-center">{t("prize.noSpinsHint")}</p>
            )}
            <p className="prize-until">{t("prize.until", { date: untilLabel() })}</p>
          </div>
        </>
      )}

      {/* Announced once, politely, when the answer arrives. */}
      <div className="prize-sr" role="status" aria-live="polite">
        {won ? t("prize.announce", { prize: prizeName(won.prize.id, won.prize.label) }) : ""}
      </div>

      {error && <p className="prize-error" role="alert">{error}</p>}

      {won && (
        <div className={`prize-card tier-${wonTier}`}>
          <p className="prize-eyebrow">
            {t("prize.won")}
            {t(`prize.tier.${wonTier}`, { defaultValue: "" }) ? ` / ${t(`prize.tier.${wonTier}`)}` : ""}
          </p>
          <h2 className="prize-won">{prizeName(won.prize.id, won.prize.label)}</h2>
          <div className="prize-code">{won.code}</div>
          <p className="prize-fine">{t("prize.codeNote")}</p>
        </div>
      )}

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
              return (
                <li key={p.code} className="prize-row">
                  <span className="prize-row-main">
                    <span>{prizeName(p.prizeId, p.label)}</span>
                    {(redeemed || needsDetails) && (
                      <span className="prize-row-state">
                        {redeemed ? t("prize.redeemed") : t("prize.pending")}
                      </span>
                    )}
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
          Do not add claims that are not in WHEEL-BRIEF.md. */}
      <section className="prize-small" aria-labelledby="prize-small-title">
        <h2 id="prize-small-title" className="prize-small-title">{t("prize.fine.title")}</h2>
        <p>{t("prize.fine.until", { date: untilLabel() })}</p>
        <p>{t("prize.fine.noCash")}</p>
        <p>{t("prize.fine.confirm")}</p>
        <p>{t("prize.fine.terms")}</p>
        <table className="prize-odds">
          <caption>{t("prize.fine.odds")}</caption>
          <thead className="prize-sr">
            <tr><th scope="col">{t("prize.listTitle")}</th><th scope="col">{t("prize.list_odds")}</th></tr>
          </thead>
          <tbody>
            {WHEEL.map((p) => (
              <tr key={p.id} className={`tier-${p.tier}`}>
                <td>{t(`prize.items.${p.id}.label`)}</td>
                <td>{pct(p.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
