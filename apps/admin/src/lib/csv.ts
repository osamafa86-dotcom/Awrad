// The CSV writer of the export (F-65). Excel opens a UTF-8 file as Arabic only when it starts with the
// byte-order mark, so the BOM comes first (spec review-focus item 6).

export type CsvValue = string | number | null | undefined;

const BOM = '﻿';
/** Text a spreadsheet would run as a formula (or a DDE call) when it starts a cell (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

function field(value: CsvValue): string {
  if (value === null || value === undefined) return '""';
  let text = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * `rows` as CSV with `headers` as both the header line and the keys read from each row: BOM first, every
 * field quoted (quotes doubled), CRLF after every line; null, undefined and a missing key are empty.
 */
export function toCsv(rows: Array<Record<string, CsvValue>>, headers: string[]): string {
  const lines = [headers.map(field).join(','), ...rows.map((row) => headers.map((name) => field(row[name])).join(','))];
  return `${BOM}${lines.map((line) => `${line}\r\n`).join('')}`;
}
