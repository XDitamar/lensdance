// src/components/AutoLanguage.jsx
//
// Picks the site's language on the first visit and keeps the two translation
// layers in sync afterwards. The whole policy lives in src/lib/lang.js — read
// the header comment there; this component only executes it.
//
// In short: the browser's language decides the target, i18next renders the DOM
// in Hebrew or English, and Google Translate covers everything else so no text
// is left in the wrong language.

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AUTO_DONE_KEY,
  applyTarget,
  cookieTarget,
  i18nLangFor,
  isManualChoice,
  reloadForTranslation,
  resolveTarget,
  savedTarget,
} from "../lib/lang";

export default function AutoLanguage() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const target = resolveTarget();

    // 1. Render the DOM in the language Google translates best from (or in
    //    Hebrew, when Hebrew is what the visitor wants). Always safe to run.
    const lng = i18nLangFor(target);
    if (i18n.language !== lng) i18n.changeLanguage(lng);

    // 2. Turn Google Translate on/off to match. Only auto-decide once per
    //    session, and never against an explicit choice by the visitor.
    const decidedThisSession = (() => {
      try {
        return !!sessionStorage.getItem(AUTO_DONE_KEY);
      } catch {
        return false;
      }
    })();

    const firstRun = !isManualChoice() && !savedTarget();
    if (decidedThisSession && !firstRun) return;

    try {
      sessionStorage.setItem(AUTO_DONE_KEY, "1");
    } catch {}

    // Already in the right state? Then there is nothing to reload for.
    if (cookieTarget() === target) return;

    if (applyTarget(target, { manual: false })) reloadForTranslation();
  }, [i18n]);

  return null;
}
