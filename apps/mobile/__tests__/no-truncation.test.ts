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
    expect(isTruncationViolation('<Text numberOfLines={1}> // why: a tab label that the OS already scales')).toBe(false);
  });

  it('reports the 1-based line numbers of the violations in a file', () => {
    const source = ['<View>', '  <Text numberOfLines={1}>{a}</Text>', '  <Text>{b}</Text>', '  numberOfLines: 1,', '</View>'].join('\n');
    expect(findTruncations(source)).toEqual([2, 4]);
  });
});
