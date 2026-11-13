// api/_lib/roster.js
//
// ─────────────────────────────────────────────────────────────────────────────
// THE COMPETITION FILE: one workbook per competition, one table per day
// ─────────────────────────────────────────────────────────────────────────────
//
// Alina photographs a competition from a list. This turns the sign-ups for ONE
// competition into a spreadsheet she can open on her phone: a sheet per day,
// each a table of every rider that day with all their details, in the order
// they ride (entry number, then class), with a column to tick off who has been
// photographed.
//
// Used by api/send-roster.js (the day-before file) and api/telegram-webhook.js
// (the /sum command). Files under api/ that start with "_" are not deployed as
// functions, so this is a library.
//
// ── NO NEW DEPENDENCY ──────────────────────────────────────────────────────
// An .xlsx is a zip of small XML files, and jszip is already a dependency (the
// gallery uses it). Writing the handful of parts by hand costs ~150 lines and
// keeps a spreadsheet library (1 MB+) out of a serverless cold start.
//
// ── ONE ROW PER RIDER PER DAY ──────────────────────────────────────────────
// A multi-day sign-up can carry a different package each day, and each day is
// its own sheet, so a two-day sign-up lands as one row on each day's sheet with
// that day's package. "Priority delivery" belongs to the whole order, so it is
// added to every row of that order.
//
// ── THE ENTRY NUMBER IS BEST-EFFORT ────────────────────────────────────────
// The sign-up form has ONE optional box, "class + entry number (if any)"
// (`classEntry`, free text). There is no separate entry-number field, so the
// number is read out of that text (see parseClassEntry). The text as the rider
// typed it is always kept in the class column, so nothing is lost when the
// reading is wrong. A separate form field would make this exact.

const JSZip = require("jszip");

/** Package ids → what Alina calls them. Keep in step with src/config/pricing.js. */
const PACKAGE_LABELS = {
  photos: "תמונות",
  video: "סרטון",
  short: "סרטון קצר (עד 15 שניות)",
  priority: "מסירה מהירה",
};

const packageLabel = (id) => PACKAGE_LABELS[id] || String(id || "");

/** What publishPermission means on the sign-up form (see PUBLISH_KEYS). */
const PUBLISH_LABELS = { yes: "מאשר/ת", no: "לא לפרסם", underage: "קטין/ה" };

/** Plain text of whatever a rider typed, one line, no control characters. */
const text = (v) =>
  v == null ? "" : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[\r\n\t]+/g, " ").trim();

/** "יום חמישי · 2026-10-22" → { label: "יום חמישי", date: "2026-10-22" } */
function splitDay(raw) {
  const [label, date] = String(raw || "").split(" · ");
  return { label: text(label), date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : "" };
}

/**
 * Reads an entry number out of the free-text class box.
 *
 *   "מקצה 3, מספר כניסה 12"  → number 12
 *   "1.10 מס' 7"             → number 7
 *   "עלייה 5"                → number 5
 *   "מקצה 3 + 12"            → number 12   (two numbers: the last is the entry)
 *   "מקצה 3"                 → no number   (one number: it belongs to the class)
 *
 * Returns { number: Number|null }. The class text itself is NOT cut up: the
 * caller keeps the original, so a wrong guess costs a blank cell, not data.
 */
function parseClassEntry(raw) {
  const s = text(raw);
  if (!s) return { number: null };

  // An explicit label wins: "מספר 12", "מס׳ 12", "מספר כניסה 12", "עלייה 12", "#12".
  const labelled = s.match(
    /(?:מספר\s+(?:כניסה|עלי+ה)|מספר|מס['׳’.]?|כניסה|עלי+ה|#|no\.?)\s*[:\-]?\s*(\d{1,4})(?!\d)/i
  );
  if (labelled) return { number: Number(labelled[1]) };

  // No label: two or more numbers → the last one is the entry number.
  const nums = s.match(/\d+(?:\.\d+)?/g) || [];
  if (nums.length >= 2) {
    const last = nums[nums.length - 1];
    if (/^\d{1,4}$/.test(last)) return { number: Number(last) };
  }
  return { number: null };
}

/**
 * Registrations (plain objects) → roster rows.
 *
 * Reads only fields the sign-up form writes (see CompetitionPage.jsx):
 *   riderName, horseName, classEntry, contact, location, horseCount, day, days,
 *   packages, dayPackages [{day, package}], depositPaid, userEmail,
 *   publishPermission, receiptWanted.
 */
function expandRows(registrations) {
  const rows = [];
  for (const r of registrations || []) {
    const wantsPriority = Array.isArray(r.packages) && r.packages.includes("priority");
    const plain = (Array.isArray(r.packages) ? r.packages : [])
      .filter((p) => p !== "priority")
      .map(packageLabel);
    const priorityTag = wantsPriority ? [PACKAGE_LABELS.priority] : [];

    const receipt = text(r.receiptWanted).toLowerCase();
    const base = {
      rider: text(r.riderName) || text(r.userName),
      horse: text(r.horseName),
      cls: text(r.classEntry),
      number: parseClassEntry(r.classEntry).number,
      paid: r.depositPaid === true,
      contact: text(r.contact),
      email: text(r.userEmail),
      publish: PUBLISH_LABELS[text(r.publishPermission)] || (r.underAge === true ? PUBLISH_LABELS.underage : ""),
      receipt: receipt && !["no", "false", "לא"].includes(receipt) ? "כן" : "",
      note: [
        Number(r.horseCount) > 1 ? `${Number(r.horseCount)} סוסים` : "",
        text(r.location),
      ].filter(Boolean).join(" · "),
    };

    const perDay = Array.isArray(r.dayPackages) ? r.dayPackages.filter((d) => d && d.day) : [];
    if (perDay.length > 0) {
      const dates = new Map((Array.isArray(r.days) ? r.days : []).map((d) => {
        const s = splitDay(d);
        return [s.label, s.date];
      }));
      for (const d of perDay) {
        const day = text(d.day);
        rows.push({
          ...base,
          day,
          sortDate: dates.get(day) || "",
          pack: [text(d.package), ...priorityTag].filter(Boolean).join(" + "),
        });
      }
    } else {
      const days = Array.isArray(r.days) && r.days.length > 0
        ? r.days.map(splitDay)
        : [{ label: text(r.day), date: "" }];
      // One package list for the whole sign-up; a multi-day sign-up without a
      // per-day breakdown shares it across its days.
      for (const d of days) {
        rows.push({
          ...base,
          day: d.label,
          sortDate: d.date,
          pack: [...plain, ...priorityTag].join(" + "),
        });
      }
    }
  }
  return rows;
}

const cmp = (a, b) => String(a).localeCompare(String(b), "he", { numeric: true });

/**
 * Day by day, in the order Alina follows on the day: entry number first (riders
 * with no number yet go after those who have one), then class, then rider.
 * Returns [{ key, label, date, rows }] with the days in calendar order.
 */
function groupByDay(rows) {
  const days = new Map();
  for (const r of rows) {
    const key = `${r.sortDate || "9999"}|${r.day}`;
    if (!days.has(key)) days.set(key, { key, label: r.day || "ללא יום", date: r.sortDate, rows: [] });
    days.get(key).rows.push(r);
  }
  const out = [...days.values()].sort((a, b) => cmp(a.key, b.key));
  for (const d of out) {
    d.rows.sort(
      (a, b) =>
        (a.number == null) - (b.number == null) ||
        (a.number ?? 0) - (b.number ?? 0) ||
        cmp(a.cls, b.cls) ||
        cmp(a.rider, b.rider)
    );
  }
  return out;
}

/* ── xlsx writer ─────────────────────────────────────────────────────────── */

const xml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 0 → A, 25 → Z, 26 → AA */
const colName = (n) => {
  let s = "";
  for (let i = n; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s;
  return s;
};

// Cell style ids, see STYLES below.
const S = { DEFAULT: 0, HEADER: 1, BODY: 2, TITLE: 3, PAID: 4, UNPAID: 5, SUB: 6, CENTER: 7 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">
<font><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="15"/><color rgb="FF2C1E12"/><name val="Arial"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><sz val="10"/><color rgb="FF6B5A4A"/><name val="Arial"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4A3525"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEAF3DE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0EE"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD7C9B8"/></left><right style="thin"><color rgb="FFD7C9B8"/></right><top style="thin"><color rgb="FFD7C9B8"/></top><bottom style="thin"><color rgb="FFD7C9B8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const cell = (c, r, value, style) =>
  value === "" || value == null
    ? `<c r="${colName(c)}${r}" s="${style}"/>`
    : `<c r="${colName(c)}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

// header, width (characters)
const COLUMNS = [
  ["#", 5],
  ["מס' עלייה", 10],
  ["מקצה", 20],
  ["רוכב/ת", 22],
  ["סוס", 18],
  ["חבילה", 26],
  ["מקדמה", 11],
  ["טלפון", 16],
  ["אימייל", 26],
  ["פרסום", 11],
  ["קבלה", 8],
  ["הערות", 22],
  ["צולם ✓", 9],
];

const HEADER_ROW = 4;

/** One day's table as the XML of a worksheet. */
function sheetXml(title, subtitle, rows) {
  const paidCount = rows.filter((r) => r.paid).length;
  const lines = [];
  lines.push(`<row r="1" ht="24" customHeight="1">${cell(0, 1, title, S.TITLE)}</row>`);
  lines.push(`<row r="2">${cell(0, 2, `${subtitle ? `${subtitle} · ` : ""}${rows.length} רוכבים · ${paidCount} שילמו מקדמה`, S.SUB)}</row>`);
  lines.push(
    `<row r="${HEADER_ROW}" ht="30" customHeight="1">${COLUMNS.map(([h], i) => cell(i, HEADER_ROW, h, S.HEADER)).join("")}</row>`
  );

  rows.forEach((row, i) => {
    const r = HEADER_ROW + 1 + i;
    const cells = [
      cell(0, r, String(i + 1), S.CENTER),
      cell(1, r, row.number == null ? "" : String(row.number), S.CENTER),
      cell(2, r, row.cls, S.BODY),
      cell(3, r, row.rider, S.BODY),
      cell(4, r, row.horse, S.BODY),
      cell(5, r, row.pack, S.BODY),
      cell(6, r, row.paid ? "שולם" : "טרם שולם", row.paid ? S.PAID : S.UNPAID),
      cell(7, r, row.contact, S.BODY),
      cell(8, r, row.email, S.BODY),
      cell(9, r, row.publish, S.CENTER),
      cell(10, r, row.receipt, S.CENTER),
      cell(11, r, row.note, S.BODY),
      cell(12, r, "", S.CENTER),
    ];
    lines.push(`<row r="${r}" ht="22" customHeight="1">${cells.join("")}</row>`);
  });

  const lastRow = Math.max(HEADER_ROW + rows.length, HEADER_ROW);
  const lastCol = colName(COLUMNS.length - 1);

  return {
    lastRow,
    lastCol,
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${COLUMNS.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${lines.join("")}</sheetData>
<autoFilter ref="A${HEADER_ROW}:${lastCol}${lastRow}"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`,
  };
}

/** A legal, unique sheet name: no []:*?/\, at most 31 characters. */
function sheetName(label, taken) {
  const base = (String(label || "יום").replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "יום").slice(0, 31);
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
  taken.add(name);
  return name;
}

/** "2026-10-22" → "22.10" (short, to tell two same-named days apart). */
const shortDate = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || "") ? `${ymd.slice(8)}.${ymd.slice(5, 7)}` : "");

/**
 * @param {object} meta   { title, dateText, registrations: number }
 * @param {object[]} rows output of expandRows()
 * @returns {Promise<Buffer>} the .xlsx file: one sheet per day
 */
async function buildRosterXlsx(meta, rows) {
  let days = groupByDay(rows);
  if (days.length === 0) days = [{ key: "", label: "ללא נרשמים", date: "", rows: [] }];

  const taken = new Set();
  const sheets = days.map((d) => {
    const name = sheetName(d.date ? `${d.label} ${shortDate(d.date)}` : d.label, taken);
    const built = sheetXml(`${meta.title} — ${d.label}`, meta.dateText, d.rows);
    return { name, ...built };
  });

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>
<definedNames>${sheets
    .map((s, i) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(s.name)}'!$A$${HEADER_ROW}:$${s.lastCol}$${s.lastRow}</definedName>`)
    .join("")}</definedNames>
</workbook>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  );
  zip.file("xl/workbook.xml", workbook);
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  zip.file("xl/styles.xml", STYLES);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, s.xml));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { expandRows, groupByDay, parseClassEntry, buildRosterXlsx, PACKAGE_LABELS };
