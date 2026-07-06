import { useEffect } from "react";
import { detectCountry } from "../hooks/useGeoPrice";

// On the first visit, switches the site to English (via the existing Google
// Translate cookie mechanism) for visitors outside Israel. Israeli visitors
// keep the native Hebrew site. A manual language choice from the floating
// translate button always wins and is never overridden.

const MANUAL_KEY = "ld_lang_manual"; // set by FloatingTranslateButton
const AUTO_KEY = "ld_lang_auto_done"; // guards against reload loops

function hasGoogTransCookie() {
  return /(?:^|;\s*)googtrans=/.test(document.cookie);
}

/* Same cookie variants FloatingTranslateButton writes, so the two stay compatible */
function setGoogTransCookie(target) {
  const host = window.location.hostname;
  const dotHost = host.startsWith(".") ? host : "." + host;
  const forever = "Fri, 31 Dec 9999 23:59:59 GMT";
  for (const v of [`/iw/${target}`, `/auto/${target}`]) {
    document.cookie = `googtrans=${v}; expires=${forever}; path=/`;
    document.cookie = `googtrans=${v}; domain=${host}; expires=${forever}; path=/`;
    document.cookie = `googtrans=${v}; domain=${dotHost}; expires=${forever}; path=/`;
  }
}

export default function AutoLanguage() {
  useEffect(() => {
    if (localStorage.getItem(MANUAL_KEY)) return; // user picked a language themselves
    if (sessionStorage.getItem(AUTO_KEY)) return; // already decided this session
    if (hasGoogTransCookie()) return; // a translation is already active

    detectCountry().then(code => {
      sessionStorage.setItem(AUTO_KEY, "1");
      if (code !== "IL") {
        setGoogTransCookie("en");
        window.location.reload();
      }
    });
  }, []);

  return null;
}
