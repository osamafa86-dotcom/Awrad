// A deliberately tiny Markdown reader for content pages (the privacy policy, F-80): `#` and `##` headings,
// paragraphs, `-` lists and `**bold**`. Anything else stays plain text; no HTML is ever produced from the
// source, so nothing in it can inject markup.

export interface Inline {
  text: string;
  bold: boolean;
}

export type Block =
  | { kind: 'heading'; level: 1 | 2; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; items: Inline[][] };

const BOLD = /\*\*(.+?)\*\*/g;

/** Splits `**bold**` runs out of one line of text; an unpaired `**` stays as text. */
export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), bold: false });
    parts.push({ text: match[1] ?? '', bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts;
}

const HEADING = /^(#{1,2}) (.*)$/;
const LIST_ITEM = /^- (.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Inline[][] | null = null;

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    if (list) blocks.push({ kind: 'list', items: list });
    paragraph = [];
    list = null;
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = HEADING.exec(line);
    const item = LIST_ITEM.exec(line);
    if (line === '') {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1] === '#' ? 1 : 2, content: parseInline((heading[2] ?? '').trim()) });
    } else if (item) {
      if (paragraph.length > 0) flush();
      (list ??= []).push(parseInline((item[1] ?? '').trim()));
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
