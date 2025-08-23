import React, { useEffect } from "react";

/**
 * Loads the Google Translate Element script and initializes it into a hidden div
 * so we can programmatically switch languages via the 'googtrans' cookie.
 */
export default function GoogleTranslateLoader() {
  useEffect(() => {
    // expose init on window for Google's callback
    window.googleTranslateElementInit = function () {
      /* global google */
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "iw,ar,ru", // Google's codes: 'iw' (Hebrew), 'ar', 'ru'
          autoDisplay: false,
          layout: window.google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };

    // inject script once
    const id = "google-translate-script";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.src =
        "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      s.async = true;
      document.head.appendChild(s);
    }

    // keep <html dir/lang> in sync for RTL polish
    const syncDir = () => {
      const cookie = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
      const val = cookie ? decodeURIComponent(cookie[1]) : "/en/en";
      const target = (val.split("/")[2] || "en").toLowerCase();
      const toHe = target === "he" || target === "iw";
      const toAr = target === "ar";
      document.documentElement.setAttribute("lang", toAr ? "ar" : toHe ? "he" : "en");
      document.documentElement.setAttribute("dir", toHe || toAr ? "rtl" : "ltr");
    };
    syncDir();
    const obs = new MutationObserver(syncDir);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // hidden container for the widget (we control language selection ourselves)
  return <div id="google_translate_element" style={{ display: "none" }} />;
}
