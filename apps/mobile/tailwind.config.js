// Tailwind/NativeWind theme derived from @awrad/design-tokens — no colour literals in this app.
// Every colour token becomes a CSS variable (light on :root, dark under prefers-color-scheme and
// a `.dark` class) and a Tailwind colour that reads it.
//   colors:          full names, e.g. bg-action-primary, text-gold-text, border-status-done
//   backgroundColor: bg/* short names, e.g. bg-canvas, bg-surface, bg-brand
//   textColor:       text/* short names, e.g. text-primary, text-secondary, text-on-brand
//   borderColor:     border/* short names, e.g. border-subtle, border-input
const plugin = require('tailwindcss/plugin');
const tokens = require('@awrad/design-tokens/tokens.json');

const entries = Object.entries(tokens.color);
const cssVarName = (name) => `--${name.replace(/\//g, '-')}`;

function vars(mode) {
  return Object.fromEntries(entries.map(([name, value]) => [cssVarName(name), value[mode].hex]));
}

function colorsFor(group) {
  const out = {};
  for (const [name] of entries) {
    const [prefix, ...rest] = name.split('/');
    if (group === undefined) out[name.replace(/\//g, '-')] = `var(${cssVarName(name)})`;
    else if (prefix === group) out[rest.join('-')] = `var(${cssVarName(name)})`;
  }
  return out;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: colorsFor(),
      backgroundColor: colorsFor('bg'),
      textColor: colorsFor('text'),
      borderColor: colorsFor('border'),
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': vars('light'),
        '@media (prefers-color-scheme: dark)': { ':root': vars('dark') },
        '.dark': vars('dark'),
      });
    }),
  ],
};
