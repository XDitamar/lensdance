import React, { useEffect } from "react";

export default function GoogleTranslateLoader() {
  useEffect(() => {
    // init callback for Google script
    window.googleTranslateElementInit = function () {
      /* global google */
      new window.google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "iw,ar,ru", // Hebrew 'iw', Arabic 'ar', Russian 'ru'
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

    // sync <html dir/lang> with chosen language (for RTL polish)
    const syncDir = () => {
      const m = document.cookie.match(/(?:^|;\s*)googtrans=([^;]+)/);
      const raw = m ? decodeURIComponent(m[1]) : "/en/en";
      const target = (raw.split("/")[2] || "en").toLowerCase();
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

  // hidden container for Google widget; we control selection ourselves
  return <div id="google_translate_element" style={{ display: "none" }} />;
}
