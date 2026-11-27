import { describe, expect, it } from 'vitest';

import { toCsv } from '@/lib/csv';

const BOM = '﻿';

describe('toCsv', () => {
  it('starts with the UTF-8 BOM so Excel reads Arabic correctly, and ends rows with CRLF', () => {
    const csv = toCsv([{ الطالب: 'أحمد', النسبة: 91 }], ['الطالب', 'النسبة']);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}"الطالب","النسبة"\r\n"أحمد","91"\r\n`);
  });

  it('quotes every field and doubles the quotes inside one, keeping commas and newlines in the field', () => {
    const csv = toCsv([{ a: 'x, y', b: 'سطر\nثانٍ', c: 'قال "نعم"' }], ['a', 'b', 'c']);
    expect(csv).toBe(`${BOM}"a","b","c"\r\n"x, y","سطر\nثانٍ","قال ""نعم"""\r\n`);
  });

  it('writes null, undefined and a missing key as an empty field, and numbers as they are', () => {
    const csv = toCsv([{ a: null, b: 0, c: undefined as unknown as null }], ['a', 'b', 'c', 'd']);
    expect(csv).toBe(`${BOM}"a","b","c","d"\r\n"","0","",""\r\n`);
  });

  it.each(['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx'])('guards the formula-like text %j with a leading apostrophe', (value) => {
    const csv = toCsv([{ a: value }], ['a']);
    expect(csv).toBe(`${BOM}"a"\r\n"'${value}"\r\n`);
  });

  it('leaves a negative number alone (only text is guarded)', () => {
    expect(toCsv([{ a: -3 }], ['a'])).toBe(`${BOM}"a"\r\n"-3"\r\n`);
  });

  it('guards a header too', () => {
    expect(toCsv([], ['=x'])).toBe(`${BOM}"'=x"\r\n`);
  });

  it('with no rows is the header line alone', () => {
    expect(toCsv([], ['الطالب', 'المجموعة'])).toBe(`${BOM}"الطالب","المجموعة"\r\n`);
  });

  it('with no headers and no rows is the BOM and an empty line', () => {
    expect(toCsv([], [])).toBe(`${BOM}\r\n`);
  });
});
