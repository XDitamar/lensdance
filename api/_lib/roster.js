// api/_lib/roster.js
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DAY-BEFORE ROSTER: who is riding, in which class, with which package
// ─────────────────────────────────────────────────────────────────────────────
//
// Alina photographs a competition from a list. Until now that list was the
// admin registrations page: fine at a desk, awkward in a stable yard. This
// turns the sign-ups for one competition into a spreadsheet she can open on her
// phone, sort, filter and tick off as she goes.
//
// Files under api/ that start with "_" are not deployed as functions, so this
// is a library for api/send-roster.js.
//
// ── NO NEW DEPENDENCY ──────────────────────────────────────────────────────
// An .xlsx is a zip of small XML files, and jszip is already a dependency (the
// gallery uses it). Writing the handful of parts by hand costs ~100 lines and
// keeps a spreadsheet library (1 MB+) out of a serverless cold start.
//
// ── ONE ROW PER RIDER PER DAY ──────────────────────────────────────────────
// A multi-day sign-up can carry a different package each day. Following that
// from a single cell is exactly the thing this file exists to avoid, so a
// two-day sign-up becomes two rows, each with that day's package. A one-day
// sign-up is one row. "Priority delivery" belongs to the whole order, so it is
// added to every row of that order.

const JSZip = require("jszip");

/** Package ids → what Alina calls them. Keep in step with src/config/pricing.js. */
const PACKAGE_LABELS = {
  photos: "תמונות",
  video: "סרטון",
  short: "סרטון קצר (עד 15 שניות)",
  priority: "מסירה מהירה",
};

const packageLabel = (id) => PACKAGE_LABELS[id] || String(id || "");

/** Plain text of whatever a rider typed, one line, no control characters. */
const text = (v) =>
  v == null ? "" : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/[\r\n\t]+/g, " ").trim();

/** "יום חמישי · 2026-10-22" → { label: "יום חמישי", date: "2026-10-22" } */
function splitDay(raw) {
  const [label, date] = String(raw || "").split(" · ");
  return { label: text(label), date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : "" };
}

/**
 * Registrations (plain objects) → roster rows, sorted for following on the day:
 * by day, then class, then rider.
 *
 * Reads only fields the sign-up form writes (see CompetitionPage.jsx):
 *   riderName, horseName, classEntry, contact, location, horseCount, day, days,
 *   packages, dayPackages [{day, package}], depositPaid.
 */
function expandRows(registrations) {
  const rows = [];
  for (const r of registrations || []) {
    const wantsPriority = Array.isArray(r.packages) && r.packages.includes("priority");
    const plain = (Array.isArray(r.packages) ? r.packages : [])
      .filter((p) => p !== "priority")
      .map(packageLabel);
    const priorityTag = wantsPriority ? [PACKAGE_LABELS.priority] : [];

    const base = {
      rider: text(r.riderName) || text(r.userName),
      horse: text(r.horseName),
      cls: text(r.classEntry),
      paid: r.depositPaid === true,
      contact: text(r.contact),
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

  const cmp = (a, b) => String(a).localeCompare(String(b), "he", { numeric: true });
  rows.sort(
    (a, b) =>
      cmp(a.sortDate || "9999", b.sortDate || "9999") ||
      cmp(a.day, b.day) ||
      cmp(a.cls, b.cls) ||
      cmp(a.rider, b.rider)
  );
  return rows;
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
  ["יום", 14],
  ["מקצה", 18],
  ["רוכב/ת", 22],
  ["סוס", 18],
  ["חבילה", 28],
  ["מקדמה", 11],
  ["טלפון", 16],
  ["הערות", 22],
  ["צולם ✓", 10],
];

/**
 * @param {object} meta   { title, dateText, registrations: number }
 * @param {object[]} rows output of expandRows()
 * @returns {Promise<Buffer>} the .xlsx file
 */
async function buildRosterXlsx(meta, rows) {
  const HEADER_ROW = 4;
  const paidCount = rows.filter((r) => r.paid).length;

  const lines = [];
  lines.push(`<row r="1" ht="24" customHeight="1">${cell(0, 1, meta.title, S.TITLE)}</row>`);
  lines.push(
    `<row r="2">${cell(
      0, 2,
      `${meta.dateText ? `${meta.dateText} · ` : ""}${meta.registrations} נרשמים · ${rows.length} שורות · ${paidCount} שילמו מקדמה`,
      S.SUB
    )}</row>`
  );
  lines.push(
    `<row r="${HEADER_ROW}" ht="30" customHeight="1">${COLUMNS.map(([h], i) => cell(i, HEADER_ROW, h, S.HEADER)).join("")}</row>`
  );

  rows.forEach((row, i) => {
    const r = HEADER_ROW + 1 + i;
    const cells = [
      cell(0, r, String(i + 1), S.CENTER),
      cell(1, r, row.day, S.BODY),
      cell(2, r, row.cls, S.BODY),
      cell(3, r, row.rider, S.BODY),
      cell(4, r, row.horse, S.BODY),
      cell(5, r, row.pack, S.BODY),
      cell(6, r, row.paid ? "שולם" : "טרם שולם", row.paid ? S.PAID : S.UNPAID),
      cell(7, r, row.contact, S.BODY),
      cell(8, r, row.note, S.BODY),
      cell(9, r, "", S.CENTER),
    ];
    lines.push(`<row r="${r}" ht="22" customHeight="1">${cells.join("")}</row>`);
  });

  const lastRow = Math.max(HEADER_ROW + rows.length, HEADER_ROW);
  const lastCol = colName(COLUMNS.length - 1);

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${HEADER_ROW}" topLeftCell="A${HEADER_ROW + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${COLUMNS.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${lines.join("")}</sheetData>
<autoFilter ref="A${HEADER_ROW}:${lastCol}${lastRow}"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  // The filter needs a defined name or Excel greys the buttons out.
  const sheetName = "מקצים";
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xml(sheetName)}'!$A$${HEADER_ROW}:$${lastCol}$${lastRow}</definedName></definedNames>
</workbook>`;

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
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
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );
  zip.file("xl/styles.xml", STYLES);
  zip.file("xl/worksheets/sheet1.xml", sheet);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

module.exports = { expandRows, buildRosterXlsx, PACKAGE_LABELS };
