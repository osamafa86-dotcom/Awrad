import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { darkColors, lightColors, radius, space, type, tokensJson } from '../index';

const cssText = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');

// 'bg/canvas' -> 'bgCanvas', 'status/done-hatch' -> 'statusDoneHatch', 'text/on-brand' -> 'textOnBrand'
const toCamel = (key: string): string =>
  key
    .split(/[/-]/)
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');

// Returns the text of the block whose header (e.g. ':root {') is given, including nested blocks.
const blockOf = (css: string, header: string): string => {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`block header not found: ${header}`);
  let depth = 0;
  for (let i = start + header.lastIndexOf('{'); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unclosed block: ${header}`);
};

const colorEntries = Object.entries(tokensJson.color) as [
  string,
  { light: { hex: string }; dark: { hex: string } },
][];

describe('color tokens: tokens.json <-> theme.ts', () => {
  it('has the same number of colors in JSON, lightColors and darkColors', () => {
    expect(Object.keys(lightColors)).toHaveLength(colorEntries.length);
    expect(Object.keys(darkColors)).toHaveLength(colorEntries.length);
  });

  it.each(colorEntries)('%s matches theme.ts values in both themes', (key, value) => {
    const name = toCamel(key);
    expect(lightColors).toHaveProperty(name);
    expect(darkColors).toHaveProperty(name);
    expect((lightColors as Record<string, string>)[name]?.toLowerCase()).toBe(
      value.light.hex.toLowerCase(),
    );
    expect((darkColors as Record<string, string>)[name]?.toLowerCase()).toBe(
      value.dark.hex.toLowerCase(),
    );
  });
});

describe('tokens.css', () => {
  const blocks = {
    light: ':root {',
    dataDark: '[data-theme="dark"] {',
    mediaDark: '@media (prefers-color-scheme: dark) {',
  } as const;

  it.each(Object.entries(blocks))('%s block defines the key variables', (_name, header) => {
    const block = blockOf(cssText, header);
    for (const variable of ['--bg-canvas', '--gold-gilt', '--status-done-hatch']) {
      expect(block).toContain(`${variable}:`);
    }
  });
});

describe('type, space and radius exports', () => {
  it('displayHijri uses MarkaziText-Bold', () => {
    expect(type.displayHijri.fontFamily).toBe('MarkaziText-Bold');
  });

  it('space and radius expose sanity values', () => {
    expect(space.s16).toBe(16);
    expect(radius.full).toBe(999);
  });
});
