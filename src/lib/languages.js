// src/lib/languages.js
// Full Google Translate language list, used by FloatingTranslateButton (search)
// and GoogleTranslateLoader (RTL detection).
//
// `code` is the code Google Translate expects in the googtrans cookie — note
// its legacy quirks: Hebrew is "iw" (not "he"), Javanese is "jw", Chinese is
// "zh-CN" / "zh-TW".
// `native` is what we show the user; `en` is the English name so search matches
// whichever the visitor types.

export const LANGUAGES = [
  { code: "ab", native: "аҧсуа бызшәа", en: "Abkhaz" },
  { code: "ace", native: "Bahsa Acèh", en: "Acehnese" },
  { code: "af", native: "Afrikaans", en: "Afrikaans" },
  { code: "sq", native: "Shqip", en: "Albanian" },
  { code: "am", native: "አማርኛ", en: "Amharic" },
  { code: "ar", native: "العربية", en: "Arabic" },
  { code: "hy", native: "Հայերեն", en: "Armenian" },
  { code: "as", native: "অসমীয়া", en: "Assamese" },
  { code: "ay", native: "Aymar aru", en: "Aymara" },
  { code: "az", native: "Azərbaycan", en: "Azerbaijani" },
  { code: "bm", native: "Bamanankan", en: "Bambara" },
  { code: "ba", native: "Башҡорт", en: "Bashkir" },
  { code: "eu", native: "Euskara", en: "Basque" },
  { code: "be", native: "Беларуская", en: "Belarusian" },
  { code: "bn", native: "বাংলা", en: "Bengali" },
  { code: "bho", native: "भोजपुरी", en: "Bhojpuri" },
  { code: "bs", native: "Bosanski", en: "Bosnian" },
  { code: "bg", native: "Български", en: "Bulgarian" },
  { code: "my", native: "မြန်မာ", en: "Burmese" },
  { code: "ca", native: "Català", en: "Catalan" },
  { code: "ceb", native: "Cebuano", en: "Cebuano" },
  { code: "ny", native: "Chichewa", en: "Chichewa" },
  { code: "zh-CN", native: "简体中文", en: "Chinese (Simplified)" },
  { code: "zh-TW", native: "繁體中文", en: "Chinese (Traditional)" },
  { code: "co", native: "Corsu", en: "Corsican" },
  { code: "hr", native: "Hrvatski", en: "Croatian" },
  { code: "cs", native: "Čeština", en: "Czech" },
  { code: "da", native: "Dansk", en: "Danish" },
  { code: "dv", native: "ދިވެހި", en: "Dhivehi" },
  { code: "doi", native: "डोगरी", en: "Dogri" },
  { code: "nl", native: "Nederlands", en: "Dutch" },
  { code: "en", native: "English", en: "English" },
  { code: "eo", native: "Esperanto", en: "Esperanto" },
  { code: "et", native: "Eesti", en: "Estonian" },
  { code: "ee", native: "Eʋegbe", en: "Ewe" },
  { code: "tl", native: "Filipino", en: "Filipino (Tagalog)" },
  { code: "fi", native: "Suomi", en: "Finnish" },
  { code: "fr", native: "Français", en: "French" },
  { code: "fy", native: "Frysk", en: "Frisian" },
  { code: "gl", native: "Galego", en: "Galician" },
  { code: "ka", native: "ქართული", en: "Georgian" },
  { code: "de", native: "Deutsch", en: "German" },
  { code: "el", native: "Ελληνικά", en: "Greek" },
  { code: "gn", native: "Avañe'ẽ", en: "Guarani" },
  { code: "gu", native: "ગુજરાતી", en: "Gujarati" },
  { code: "ht", native: "Kreyòl ayisyen", en: "Haitian Creole" },
  { code: "ha", native: "Hausa", en: "Hausa" },
  { code: "haw", native: "ʻŌlelo Hawaiʻi", en: "Hawaiian" },
  { code: "iw", native: "עברית", en: "Hebrew" },
  { code: "hi", native: "हिन्दी", en: "Hindi" },
  { code: "hmn", native: "Hmoob", en: "Hmong" },
  { code: "hu", native: "Magyar", en: "Hungarian" },
  { code: "is", native: "Íslenska", en: "Icelandic" },
  { code: "ig", native: "Igbo", en: "Igbo" },
  { code: "ilo", native: "Ilokano", en: "Ilocano" },
  { code: "id", native: "Bahasa Indonesia", en: "Indonesian" },
  { code: "ga", native: "Gaeilge", en: "Irish" },
  { code: "it", native: "Italiano", en: "Italian" },
  { code: "ja", native: "日本語", en: "Japanese" },
  { code: "jw", native: "Basa Jawa", en: "Javanese" },
  { code: "kn", native: "ಕನ್ನಡ", en: "Kannada" },
  { code: "kk", native: "Қазақ тілі", en: "Kazakh" },
  { code: "km", native: "ខ្មែរ", en: "Khmer" },
  { code: "rw", native: "Kinyarwanda", en: "Kinyarwanda" },
  { code: "gom", native: "कोंकणी", en: "Konkani" },
  { code: "ko", native: "한국어", en: "Korean" },
  { code: "kri", native: "Krio", en: "Krio" },
  { code: "ku", native: "Kurdî", en: "Kurdish (Kurmanji)" },
  { code: "ckb", native: "کوردیی ناوەندی", en: "Kurdish (Sorani)" },
  { code: "ky", native: "Кыргызча", en: "Kyrgyz" },
  { code: "lo", native: "ລາວ", en: "Lao" },
  { code: "la", native: "Latina", en: "Latin" },
  { code: "lv", native: "Latviešu", en: "Latvian" },
  { code: "ln", native: "Lingála", en: "Lingala" },
  { code: "lt", native: "Lietuvių", en: "Lithuanian" },
  { code: "lg", native: "Luganda", en: "Luganda" },
  { code: "lb", native: "Lëtzebuergesch", en: "Luxembourgish" },
  { code: "mk", native: "Македонски", en: "Macedonian" },
  { code: "mai", native: "मैथिली", en: "Maithili" },
  { code: "mg", native: "Malagasy", en: "Malagasy" },
  { code: "ms", native: "Bahasa Melayu", en: "Malay" },
  { code: "ml", native: "മലയാളം", en: "Malayalam" },
  { code: "mt", native: "Malti", en: "Maltese" },
  { code: "mi", native: "Te Reo Māori", en: "Maori" },
  { code: "mr", native: "मराठी", en: "Marathi" },
  { code: "mni-Mtei", native: "ꯃꯤꯇꯩꯂꯣꯟ", en: "Meiteilon (Manipuri)" },
  { code: "lus", native: "Mizo ṭawng", en: "Mizo" },
  { code: "mn", native: "Монгол", en: "Mongolian" },
  { code: "ne", native: "नेपाली", en: "Nepali" },
  { code: "no", native: "Norsk", en: "Norwegian" },
  { code: "or", native: "ଓଡ଼ିଆ", en: "Odia (Oriya)" },
  { code: "om", native: "Afaan Oromoo", en: "Oromo" },
  { code: "ps", native: "پښتو", en: "Pashto" },
  { code: "fa", native: "فارسی", en: "Persian" },
  { code: "pl", native: "Polski", en: "Polish" },
  { code: "pt", native: "Português", en: "Portuguese" },
  { code: "pa", native: "ਪੰਜਾਬੀ", en: "Punjabi" },
  { code: "qu", native: "Runasimi", en: "Quechua" },
  { code: "ro", native: "Română", en: "Romanian" },
  { code: "ru", native: "Русский", en: "Russian" },
  { code: "sm", native: "Gagana Samoa", en: "Samoan" },
  { code: "sa", native: "संस्कृतम्", en: "Sanskrit" },
  { code: "gd", native: "Gàidhlig", en: "Scots Gaelic" },
  { code: "nso", native: "Sepedi", en: "Sepedi" },
  { code: "sr", native: "Српски", en: "Serbian" },
  { code: "st", native: "Sesotho", en: "Sesotho" },
  { code: "sn", native: "ChiShona", en: "Shona" },
  { code: "sd", native: "سنڌي", en: "Sindhi" },
  { code: "si", native: "සිංහල", en: "Sinhala" },
  { code: "sk", native: "Slovenčina", en: "Slovak" },
  { code: "sl", native: "Slovenščina", en: "Slovenian" },
  { code: "so", native: "Soomaali", en: "Somali" },
  { code: "es", native: "Español", en: "Spanish" },
  { code: "su", native: "Basa Sunda", en: "Sundanese" },
  { code: "sw", native: "Kiswahili", en: "Swahili" },
  { code: "sv", native: "Svenska", en: "Swedish" },
  { code: "tg", native: "Тоҷикӣ", en: "Tajik" },
  { code: "ta", native: "தமிழ்", en: "Tamil" },
  { code: "tt", native: "Татарча", en: "Tatar" },
  { code: "te", native: "తెలుగు", en: "Telugu" },
  { code: "th", native: "ไทย", en: "Thai" },
  { code: "ti", native: "ትግርኛ", en: "Tigrinya" },
  { code: "ts", native: "Xitsonga", en: "Tsonga" },
  { code: "tr", native: "Türkçe", en: "Turkish" },
  { code: "tk", native: "Türkmen", en: "Turkmen" },
  { code: "ak", native: "Twi", en: "Twi (Akan)" },
  { code: "uk", native: "Українська", en: "Ukrainian" },
  { code: "ur", native: "اردو", en: "Urdu" },
  { code: "ug", native: "ئۇيغۇرچە", en: "Uyghur" },
  { code: "uz", native: "Oʻzbekcha", en: "Uzbek" },
  { code: "vi", native: "Tiếng Việt", en: "Vietnamese" },
  { code: "cy", native: "Cymraeg", en: "Welsh" },
  { code: "xh", native: "isiXhosa", en: "Xhosa" },
  { code: "yi", native: "ייִדיש", en: "Yiddish" },
  { code: "yo", native: "Yorùbá", en: "Yoruba" },
  { code: "zu", native: "isiZulu", en: "Zulu" },
];

/** Right-to-left languages — drives <html dir> so the layout flips correctly. */
export const RTL_CODES = new Set([
  "ar", "iw", "he", "fa", "ur", "ps", "sd", "ug", "yi", "ckb", "dv",
]);

export const isRtl = (code) => RTL_CODES.has(String(code || "").toLowerCase());

/** Comma-separated list for Google's `includedLanguages` option. */
export const ALL_CODES = LANGUAGES.map((l) => l.code).join(",");

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code.toLowerCase(), l]));

/** Lookup tolerant of casing and the he/iw alias. */
export function findLanguage(code) {
  const c = String(code || "").toLowerCase();
  if (c === "he") return BY_CODE.get("iw");
  return BY_CODE.get(c) || null;
}

/**
 * Free-text search over native name, English name and code.
 * Prefix matches rank above substring matches so "en" surfaces English first.
 */
export function searchLanguages(query, limit = 60) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const l of LANGUAGES) {
    const native = l.native.toLowerCase();
    const eng = l.en.toLowerCase();
    const code = l.code.toLowerCase();
    let score = -1;
    if (code === q) score = 0;
    else if (eng.startsWith(q) || native.startsWith(q)) score = 1;
    else if (eng.includes(q) || native.includes(q)) score = 2;
    else if (code.startsWith(q)) score = 3;
    if (score >= 0) scored.push([score, l]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].en.localeCompare(b[1].en));
  return scored.slice(0, limit).map(([, l]) => l);
}
