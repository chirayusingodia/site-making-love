// ─────────────────────────────────────────────────────────────
// PUNYATA — CSV cell escaping (shared)
//
// [Bug 4.9] Every exporter used to only double embedded quotes.
// That leaves spreadsheet formula injection wide open: a value
// starting with = + - @ (or a tab/CR) executes as a formula when
// the export opens in Excel/Sheets. Subscriber-supplied fields
// (names, gotra, notes) flow into these exports, so the escape is
// security-relevant, not cosmetic.
// ─────────────────────────────────────────────────────────────

/** Prefix that neuters formula interpretation in Excel & Sheets. */
const FORMULA_SAFE_PREFIX = "'";

export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);

  // Neutralise leading formula triggers before quoting.
  if (/^[=+\-@\t\r]/.test(s)) {
    s = FORMULA_SAFE_PREFIX + s;
  }

  // RFC-4180 quoting: wrap when needed; double embedded quotes.
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Whole-row convenience: cells joined with commas, no trailing newline. */
export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}
