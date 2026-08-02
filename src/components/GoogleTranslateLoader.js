// src/components/GoogleTranslateLoader.js
//
// Injects the Google Translate widget — the layer that translates EVERY text
// node on the page, including the Hebrew still hardcoded in the JSX that
// i18next knows nothing about. The policy lives in src/lib/lang.js.

import React, { useEffect } from "react";
import { isRtl } from "../lib/languages";
import { cookieTarget } from "../lib/lang";

export default function GoogleTranslateLoader() {
  useEffect(() => {
    // init callback for Google script
    window.googleTranslateElementInit = function () {
      new window.google.translate.TranslateElement( // eslint-disable-line no-undef
        {
          // The DOM is a mix: i18next renders English, but a lot of copy is
          // still hardcoded Hebrew. What actually drives the translation is
          // the googtrans cookie, which we write as /auto/<target> so Google
          // detects the source per block (see src/lib/lang.js). This option
          // only seeds the widget, so it stays on the language most of the
          // untranslated markup is written in.
          pageLanguage: "iw",
          // No `includedLanguages`: omitting it lets Google offer every
          // language it supports, which is what the searchable menu in
          // FloatingTranslateButton needs. Don't re-add the whitelist —
          // any code missing from it silently fails to translate.
          autoDisplay: false,
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };

    // inject only once
    const id = "google-translate-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      s.async = true;
      document.head.appendChild(s);
    }

    // Sync <html dir/lang> with the language Google is rendering (RTL polish).
    // Works for any language in src/lib/languages.js, not just he/ar.
    // Only runs while a translation is actually active — with no googtrans
    // cookie the page is native i18next and src/i18n.js owns these attributes,
    // so overwriting them here would flip the Hebrew site to LTR.
    const syncDir = () => {
      const target = cookieTarget();
      if (!target) return;
      const t = target.toLowerCase();
      // "iw" is Google's legacy code for Hebrew; the HTML lang attribute wants "he".
      document.documentElement.setAttribute("lang", t === "iw" ? "he" : t);
      document.documentElement.setAttribute("dir", isRtl(t) ? "rtl" : "ltr");
    };
    syncDir();
    const obs = new MutationObserver(syncDir);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // hidden container for Google widget; we control selection ourselves
  return <div id="google_translate_element" style={{ display: "none" }} />;
}
