import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseAttendanceCsv,
  parseCsv,
  parseDailyCsv,
  parseLegacyDate,
  parseTimestamp,
  parseTristate,
  parseWeeklyCsv,
  splitChecklist,
} from '../parse.ts';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8');

describe('parseCsv (RFC 4180)', () => {
  it('strips a UTF-8 BOM and splits plain fields', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas, doubled quotes and newlines inside quoted fields', () => {
    expect(parseCsv('x,"a, b","say ""hi""","line 1\r\nline 2"\r\n')).toEqual([
      ['x', 'a, b', 'say "hi"', 'line 1\r\nline 2'],
    ]);
  });

  it('accepts CRLF and LF, a missing final newline, and skips blank lines', () => {
    expect(parseCsv('a,b\r\n\r\n1,2\n\n3,')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', ''],
    ]);
  });

  it('rejects an unterminated quoted field', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(/علامة تنصيص/);
  });
});

describe('parseDailyCsv', () => {
  const rows = parseDailyCsv(fixture('daily.sample.csv'));

  it('reads all 12 responses of the sample, numbered as spreadsheet rows', () => {
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.row)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('recognises the Google Forms columns and keeps every other answer by its header', () => {
    expect(rows[0]).toEqual({
      row: 2,
      timestamp: '01/03/2025 21:10:05',
      name: 'أحمد التجريبي',
      date: '01/03/2025',
      answers: {
        'قراءة ورد القرآن (ست أرباع)': 'تم',
        'ورد الأذكار': 'أذكار الصباح, أذكار المساء',
        'ورد القيام': 'تم',
        'تفسير ابن جزي': 'تم',
        'الجمع بين الصحيحين': 'لم يتم',
        ملاحظات: '',
      },
    });
  });

  it('keeps quoted commas and embedded newlines inside one answer', () => {
    expect(rows[1]!.answers['ملاحظات']).toBe('ملاحظة فيها، و, فاصلة');
    expect(rows[2]!.answers['ملاحظات']).toBe('تصحيح\nلسجلّ اليوم');
  });

  it('trims headers and names and collapses inner spaces', () => {
    const [row] = parseDailyCsv(
      ' الطابع الزمني , اسمك ,التاريخ,عادة\n1/3/2025 9:00:00,  أحمد   التجريبي ,1/3/2025,تم\n',
    );
    expect(row).toMatchObject({ name: 'أحمد التجريبي', answers: { عادة: 'تم' } });
  });

  it('has no date when the form had no date question (the timestamp gives the day)', () => {
    const [row] = parseDailyCsv('الطابع الزمني,اسمك,عادة\n1/3/2025 9:00:00,أحمد,تم\n');
    expect(row!.date).toBeNull();
  });

  it('fails with an Arabic message when a required column is missing', () => {
    expect(() => parseDailyCsv('الطابع الزمني,التاريخ\n1/3/2025,1/3/2025\n')).toThrow(/اسمك/);
  });
});

describe('parseWeeklyCsv', () => {
  it('accepts «الأسبوع» as the date column', () => {
    const rows = parseWeeklyCsv(fixture('weekly.sample.csv'));
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ name: 'خالد المثالي', date: '04/03/2025' });
    expect(rows[0]!.answers['تحضير الدرس الأسبوعي']).toBe('قراءة المتن, سماع الشرح');
  });
});

describe('parseAttendanceCsv', () => {
  it('reads the grid: one student per row, one session date per column', () => {
    const rows = parseAttendanceCsv(fixture('attendance.sample.csv'));
    expect(rows).toHaveLength(4);
    expect(rows[2]).toEqual({
      row: 4,
      name: 'يوسف النموذجي',
      marks: [
        { date: '02/03/2025', value: 'حاضر' },
        { date: '09/03/2025', value: '' },
      ],
    });
  });
});

describe('cell values', () => {
  it('maps the form answers to entry statuses; blank stays blank; anything else is invalid', () => {
    expect(parseTristate('تم')).toBe('done');
    expect(parseTristate(' لم يتم ')).toBe('not_done');
    expect(parseTristate('غير مطلوب اليوم')).toBe('not_required');
    expect(parseTristate('غير مطلوب هذا الأسبوع')).toBe('not_required');
    expect(parseTristate('')).toBe('blank');
    expect(parseTristate('ربما')).toBe('invalid');
  });

  it('splits checklist answers on Latin and Arabic commas', () => {
    expect(splitChecklist('أذكار الصباح, أذكار المساء،أذكار الصلوات ,')).toEqual([
      'أذكار الصباح',
      'أذكار المساء',
      'أذكار الصلوات',
    ]);
    expect(splitChecklist('  ')).toEqual([]);
  });
});

describe('parseLegacyDate', () => {
  it('reads ISO and year-first dates whatever the order setting', () => {
    expect(parseLegacyDate('2025-03-01', 'mdy')).toBe('2025-03-01');
    expect(parseLegacyDate('2025/3/1', 'dmy')).toBe('2025-03-01');
  });

  it('reads day-first or month-first dates per the mapping', () => {
    expect(parseLegacyDate('01/03/2025', 'dmy')).toBe('2025-03-01');
    expect(parseLegacyDate('3/14/2025', 'mdy')).toBe('2025-03-14');
  });

  it('reads Arabic-Indic digits', () => {
    expect(parseLegacyDate('٠١/٠٣/٢٠٢٥', 'dmy')).toBe('2025-03-01');
  });

  it('rejects impossible and unreadable dates', () => {
    expect(parseLegacyDate('30/02/2025', 'dmy')).toBeNull();
    expect(parseLegacyDate('3/14/2025', 'dmy')).toBeNull();
    expect(parseLegacyDate('', 'dmy')).toBeNull();
    expect(parseLegacyDate('أمس', 'dmy')).toBeNull();
  });
});

describe('parseTimestamp', () => {
  it('returns a sortable local date-time', () => {
    expect(parseTimestamp('01/03/2025 21:10:05', 'dmy')).toBe('2025-03-01T21:10:05');
    expect(parseTimestamp('2025-03-03 20:30', 'dmy')).toBe('2025-03-03T20:30:00');
  });

  it('reads 12-hour times with ص/م or AM/PM', () => {
    expect(parseTimestamp('02/03/2025 10:30:00 م', 'dmy')).toBe('2025-03-02T22:30:00');
    expect(parseTimestamp('02/03/2025 12:05:00 ص', 'dmy')).toBe('2025-03-02T00:05:00');
    expect(parseTimestamp('3/2/2025 12:05:00 PM', 'mdy')).toBe('2025-03-02T12:05:00');
  });

  it('returns null for an unreadable timestamp', () => {
    expect(parseTimestamp('', 'dmy')).toBeNull();
    expect(parseTimestamp('01/03/2025 25:00:00', 'dmy')).toBeNull();
  });
});
