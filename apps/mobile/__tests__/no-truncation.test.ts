import path from 'node:path';

// The matcher behind `scripts/check-no-truncation.mjs` (DESIGN.md §7 rule 9: no text is truncated).
const { findTruncations, isTruncationViolation } = jest.requireActual<{
  isTruncationViolation(line: string): boolean;
  findTruncations(source: string): number[];
}>(path.resolve(__dirname, '../../../scripts/no-truncation.cjs'));

describe('no-truncation matcher', () => {
  it.each([
    '<Text numberOfLines={1}>{name}</Text>',
    '  numberOfLines={ 1 }',
    'const props = { numberOfLines: 1 };',
    'style={x} numberOfLines={1} // a plain comment is not an exemption',
  ])('flags a single-line clamp: %s', (line) => {
    expect(isTruncationViolation(line)).toBe(true);
  });

  it.each([
    '<Text numberOfLines={2}>{body}</Text>',
    '<Text numberOfLines={10}>{body}</Text>',
    'const props = { numberOfLines: 12 };',
    '<Text>{name}</Text>',
    'numberOfLines={lines}',
  ])('ignores anything that is not a one-line clamp: %s', (line) => {
    expect(isTruncationViolation(line)).toBe(false);
  });

  it('accepts a one-line clamp that explains itself with `// why:` on the same line', () => {
    // A `// why:` comment sits between JSX attributes (as it would in source), not in the element's text.
    expect(isTruncationViolation('  numberOfLines={1} // why: a tab label the OS already scales')).toBe(false);
    expect(isTruncationViolation('  numberOfLines: 1, // why: same, in a style/props object')).toBe(false);
  });

  it.each([
    '<span className="truncate">{name}</span>',
    "className={cn('t-body-md', 'md:truncate')}",
    '<p className="line-clamp-1 text-fg-primary">{title}</p>',
    '<td className="text-ellipsis overflow-hidden">',
  ])('flags a Tailwind one-line truncation class on the web: %s', (line) => {
    expect(isTruncationViolation(line)).toBe(true);
  });

  it.each([
    '<p className="line-clamp-2">{body}</p>',
    '<p className="line-clamp-10">{body}</p>',
    '// A label that wraps rather than truncates.',
    '/** Name and target: names wrap, never truncate (DESIGN.md §7 rule 9). */',
    ' * never truncate a name',
    '{/* never truncate here */}',
    '<span className="truncated-name">',
    '<span className="whitespace-normal">{name}</span>',
  ])('ignores web classes and words that are not a one-line truncation: %s', (line) => {
    expect(isTruncationViolation(line)).toBe(false);
  });

  it('accepts a web truncation class that explains itself with `// why:` on the same line', () => {
    expect(isTruncationViolation("const id = 'truncate'; // why: a log id, never a name")).toBe(false);
  });

  // Final review admin I-2: the student page cut notes at 140 characters with `slice` + «…» and left the tail in a
  // hover-only tooltip; a character-count excerpt is a truncation too.
  it.each([
    'return text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text;',
    "const short = note.substring(0, 80) + '…';",
    "const short = note.slice(0, 80) + '...';",
  ])('flags a character-count excerpt that ends in an ellipsis: %s', (line) => {
    expect(isTruncationViolation(line)).toBe(true);
  });

  it.each([
    'return date.slice(0, 7);',
    "const id = crypto.randomUUID().slice(0, 8);",
    "const label = isLoading ? 'جارٍ الحفظ…' : 'حفظ';",
    '// Never `text.slice(0, n) + "…"`: show the whole text.',
  ])('ignores slices without an ellipsis, ellipses without a slice, and comments: %s', (line) => {
    expect(isTruncationViolation(line)).toBe(false);
  });

  it('reports the 1-based line numbers of the violations in a file', () => {
    const source = ['<View>', '  <Text numberOfLines={1}>{a}</Text>', '  <Text>{b}</Text>', '  numberOfLines: 1,', '</View>'].join('\n');
    expect(findTruncations(source)).toEqual([2, 4]);
  });
});
