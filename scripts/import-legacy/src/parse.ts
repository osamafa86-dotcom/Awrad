// Reading the sheikh's Google Forms / Sheets CSV exports: a small RFC 4180 parser, the three sheet
// shapes (daily and weekly responses, the attendance grid) and the cell-level readers.
// Everything stays raw text here; map.ts decides what a column or a name means.

export type DateOrder = 'dmy' | 'mdy';
export type CellStatus = 'done' | 'not_done' | 'not_required' | 'blank' | 'invalid';

/** One form response. `row` is the spreadsheet row number (the header is row 1). */
export interface LegacyDailyRow {
  row: number;
  timestamp: string;
  name: string;
  /** The answer to the date question; null when the form had none (the timestamp gives the day). */
  date: string | null;
  /** Every other answer, by its column header. */
  answers: Record<string, string>;
}

export type LegacyWeeklyRow = LegacyDailyRow;

/** One student's row of the attendance grid: a column per session date. */
export interface LegacyAttendanceRow {
  row: number;
  name: string;
  marks: { date: string; value: string }[];
}

const TIMESTAMP_HEADERS = ['الطابع الزمني', 'timestamp'];
const NAME_HEADERS = ['اسمك', 'الاسم', 'name'];
const DAILY_DATE_HEADERS = ['التاريخ', 'date'];
const WEEKLY_DATE_HEADERS = ['الأسبوع', 'التاريخ', 'week', 'date'];

/**
 * RFC 4180: comma-separated fields, double-quoted fields may hold commas, newlines and doubled
 * quotes. A leading UTF-8 BOM is dropped; CRLF and LF both end a record; blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRecord = () => {
    record.push(field);
    if (record.length > 1 || record[0] !== '') records.push(record);
    record = [];
    field = '';
  };
  while (i < input.length) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += ch;
      }
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      endRecord();
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
    } else {
      field += ch;
    }
    i += 1;
  }
  if (quoted) throw new Error('ملف CSV غير صالح: حقل بلا علامة تنصيص ختامية');
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

/** Trims and collapses inner whitespace (names and headers as typed into the sheet). */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const candidate of candidates) {
    const index = lower.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function parseResponses(text: string, dateHeaders: string[]): LegacyDailyRow[] {
  const [header, ...records] = parseCsv(text);
  if (!header) return [];
  const headers = header.map(cleanText);
  const timestampAt = findColumn(headers, TIMESTAMP_HEADERS);
  const nameAt = findColumn(headers, NAME_HEADERS);
  const missing = [
    timestampAt < 0 ? `«${TIMESTAMP_HEADERS[0]}»` : null,
    nameAt < 0 ? `«${NAME_HEADERS[0]}»` : null,
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`عمود مفقود في ملف الردود: ${missing.join('، ')}`);
  const dateAt = findColumn(headers, dateHeaders);
  const answerColumns = headers
    .map((h, index) => ({ h, index }))
    .filter(({ index }) => index !== timestampAt && index !== nameAt && index !== dateAt);

  return records.map((cells, index) => ({
    row: index + 2,
    timestamp: cleanText(cells[timestampAt] ?? ''),
    name: cleanText(cells[nameAt] ?? ''),
    date: dateAt < 0 ? null : cleanText(cells[dateAt] ?? ''),
    answers: Object.fromEntries(
      answerColumns.map(({ h, index: at }) => [h, (cells[at] ?? '').trim()]),
    ),
  }));
}

/** Daily responses: «الطابع الزمني», «اسمك», optional «التاريخ», then one column per question. */
export function parseDailyCsv(text: string): LegacyDailyRow[] {
  return parseResponses(text, DAILY_DATE_HEADERS);
}

/** Weekly responses: as daily, the date question may be headed «الأسبوع». */
export function parseWeeklyCsv(text: string): LegacyWeeklyRow[] {
  return parseResponses(text, WEEKLY_DATE_HEADERS);
}

/** The attendance grid: the first column is the student's name, each other header a session date. */
export function parseAttendanceCsv(text: string): LegacyAttendanceRow[] {
  const [header, ...records] = parseCsv(text);
  if (!header) return [];
  const dates = header.slice(1).map(cleanText);
  return records.map((cells, index) => ({
    row: index + 2,
    name: cleanText(cells[0] ?? ''),
    marks: dates.map((date, at) => ({ date, value: cleanText(cells[at + 1] ?? '') })),
  }));
}

/** A tristate answer: «تم», «لم يتم», «غير مطلوب …» (اليوم / هذا الأسبوع); empty = blank. */
export function parseTristate(cell: string): CellStatus {
  const value = cleanText(cell);
  if (value === '') return 'blank';
  if (value === 'تم') return 'done';
  if (value === 'لم يتم') return 'not_done';
  if (value.startsWith('غير مطلوب')) return 'not_required';
  return 'invalid';
}

/** A checkbox answer: Google Forms joins the ticked options with ", " (Arabic commas accepted). */
export function splitChecklist(cell: string): string[] {
  return cell
    .split(/[,،]/)
    .map(cleanText)
    .filter((label) => label !== '');
}

function westernDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function isoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * A sheet date as 'YYYY-MM-DD', or null if unreadable or impossible. Year-first dates
 * (2025-03-01, 2025/3/1) are unambiguous; d/m/yyyy vs m/d/yyyy follows `order` (the sheet locale).
 */
export function parseLegacyDate(raw: string, order: DateOrder): string | null {
  const value = westernDigits(cleanText(raw));
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (yearFirst) return isoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
  const yearLast = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value);
  if (!yearLast) return null;
  const [a, b] = [Number(yearLast[1]), Number(yearLast[2])];
  return order === 'dmy' ? isoDate(Number(yearLast[3]), b, a) : isoDate(Number(yearLast[3]), a, b);
}

/**
 * A form timestamp as a sortable local 'YYYY-MM-DDTHH:MM:SS', or null. The time may be 24-hour
 * or 12-hour with ص/م or AM/PM.
 */
export function parseTimestamp(raw: string, order: DateOrder): string | null {
  const value = westernDigits(cleanText(raw));
  const match = /^(\S+)\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(ص|م|am|pm))?$/i.exec(value);
  if (!match) return null;
  const date = parseLegacyDate(match[1]!, order);
  let hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? '0');
  const meridiem = match[5]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem === 'م' || meridiem === 'pm';
    hour = (hour % 12) + (pm ? 12 : 0);
  }
  if (!date || hour > 23 || minute > 59 || second > 59) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
}
