import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseInline, parseMarkdown } from '@/lib/markdown';

const fixture = readFileSync(path.resolve(import.meta.dirname, 'fixtures/sample.md'), 'utf8');

const plain = (text: string) => ({ text, bold: false });
const bold = (text: string) => ({ text, bold: true });

describe('parseMarkdown', () => {
  it('turns the fixture into headings, paragraphs and a list', () => {
    expect(parseMarkdown(fixture)).toEqual([
      { kind: 'heading', level: 1, content: [plain('العنوان')] },
      { kind: 'paragraph', content: [plain('سطر أول يكمل الفقرة '), bold('بخط عريض'), plain(' هنا.')] },
      { kind: 'heading', level: 2, content: [plain('قسم')] },
      { kind: 'list', items: [[plain('بند أول')], [plain('بند '), bold('ثانٍ')]] },
      // Only #, ##, -, ** are syntax: an unclosed ** and a ### line stay text, joined into the paragraph.
      { kind: 'paragraph', content: [plain('فقرة بعد القائمة فيها **نجمتان بلا إغلاق. ### ليس عنوانًا')] },
    ]);
  });

  it('reads Windows line endings and ignores blank lines around blocks', () => {
    expect(parseMarkdown('\r\n\r\n## أ\r\n\r\nب\r\n')).toEqual([
      { kind: 'heading', level: 2, content: [plain('أ')] },
      { kind: 'paragraph', content: [plain('ب')] },
    ]);
  });

  it('returns nothing for an empty document', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('splits bold runs and keeps the text around them', () => {
    expect(parseInline('**أ** ب **ج**')).toEqual([bold('أ'), plain(' ب '), bold('ج')]);
  });

  it('keeps a lone pair of asterisks as text', () => {
    expect(parseInline('أ ** ب')).toEqual([plain('أ ** ب')]);
  });
});
