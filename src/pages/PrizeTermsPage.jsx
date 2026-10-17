// src/pages/PrizeTermsPage.jsx
//
// /prize-terms: the rules of the prize wheel, in plain language, with the exact
// probability of every prize. Public (no sign-in), linked from the wheel page's
// small print and from the result screen.
//
// The odds table is generated from the same weights the server draws with
// (src/config/prizes.js is a generated copy of api/_prizes.js, and
// prizes.test.js fails if they differ), so this page cannot drift from the
// real draw.
//
// TODO: legal review. This is a plain statement of how the wheel works, NOT
// legally reviewed text. A prize wheel tied to a purchase may count as a
// promotion or lottery under Israeli law (a published תקנון, possibly a
// permit). Itamar and Alina must check with a lawyer before launch.

import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PRIZES, PRIZE_VALID_UNTIL, PRIZE_WHEEL_UNTIL, TOTAL_WEIGHT, dmy } from "../config/prizes";
import "./prize.css";

export default function PrizeTermsPage() {
  const { t, i18n } = useTranslation();

  const capped = PRIZES.filter((p) => p.capped);
  const pct = (part, whole) =>
    `${((part / whole) * 100).toLocaleString(i18n.language, { maximumFractionDigits: 2 })}%`;
  const name = (id) => t(`prize.items.${id}.label`);

  return (
    <div className="prize-page prize-terms">
      <article className="prize-terms-body">
        <p className="prize-eyebrow">{t("prizeTerms.eyebrow")}</p>
        <h1 className="prize-title">{t("prizeTerms.title")}</h1>
        <div className="prize-rule" />

        <section>
          <h2>{t("prizeTerms.whoTitle")}</h2>
          <p>{t("prizeTerms.whoBody")}</p>
        </section>

        <section>
          <h2>{t("prizeTerms.periodTitle")}</h2>
          <p>{t("prizeTerms.periodBody", { date: dmy(PRIZE_WHEEL_UNTIL) })}</p>
        </section>

        <section>
          <h2>{t("prizeTerms.prizesTitle")}</h2>
          <p>{t("prizeTerms.prizesIntro", { count: PRIZES.length })}</p>
          <ol>
            {PRIZES.map((p) => <li key={p.id}>{name(p.id)}</li>)}
          </ol>
          <p>{t("prizeTerms.followUps")}</p>
        </section>

        <section>
          <h2>{t("prizeTerms.cappedTitle")}</h2>
          <p>{t("prizeTerms.cappedBody")}</p>
          <ul>
            {capped.map((p) => <li key={p.id}>{t(`prize.items.${p.id}.short`)}</li>)}
          </ul>
          <p>{t("prizeTerms.cappedNote")}</p>
        </section>

        <section>
          <h2>{t("prizeTerms.redeemTitle")}</h2>
          <ul>
            <li>{t("prizeTerms.redeemLater")}</li>
            <li>{t("prizeTerms.redeemNotSame")}</li>
            <li>{t("prizeTerms.redeemAlina")}</li>
          </ul>
        </section>

        <section>
          <h2>{t("prizeTerms.validityTitle")}</h2>
          <p>{t("prizeTerms.validityBody", { date: dmy(PRIZE_VALID_UNTIL) })}</p>
        </section>

        <section>
          <h2>{t("prizeTerms.generalTitle")}</h2>
          <ul>
            <li>{t("prizeTerms.generalNoCash")}</li>
            <li>{t("prizeTerms.generalNoCombine")}</li>
            <li>{t("prizeTerms.generalConfirm")}</li>
            <li>{t("prizeTerms.generalCode")}</li>
          </ul>
        </section>

        <section>
          <h2>{t("prizeTerms.oddsTitle")}</h2>
          <p>{t("prizeTerms.oddsIntro")}</p>
          <div className="prize-terms-scroll">
            <table className="prize-terms-table">
              <thead>
                <tr>
                  <th scope="col">{t("prizeTerms.colPrize")}</th>
                  <th scope="col">{t("prizeTerms.colOdds")}</th>
                </tr>
              </thead>
              <tbody>
                {PRIZES.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{name(p.id)}</th>
                    <td>{pct(p.weight, TOTAL_WEIGHT)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="prize-fine">{t("prizeTerms.oddsNote")}</p>
        </section>

        <p className="prize-terms-back">
          <Link className="prize-link" to="/prize">{t("prizeTerms.back")}</Link>
        </p>
      </article>
    </div>
  );
}
