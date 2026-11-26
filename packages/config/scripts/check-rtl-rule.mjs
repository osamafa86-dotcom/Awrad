// Verifies the shared RTL rule flags physical left/right usage and accepts logical equivalents.
import { ESLint } from 'eslint';
import config from '../eslint.config.js';

const MESSAGE = 'استخدم الخصائص المنطقية (start/end) بدل left/right';

const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config });

const lint = async (code, filePath) => {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax' || m.fatal);
};

const bad = [
  ['marginLeft', 'const s = { marginLeft: 8 };'],
  ['marginRight', 'const s = { marginRight: 8 };'],
  ['paddingLeft', 'const s = { paddingLeft: 8 };'],
  ['paddingRight', 'const s = { paddingRight: 8 };'],
  ['left', 'const s = { left: 0 };'],
  ['right', 'const s = { right: 0 };'],
  ['borderLeftWidth', 'const s = { borderLeftWidth: 1 };'],
  ['borderRightColor', 'const s = { borderRightColor: "red" };'],
  ['quoted key', 'const s = { "marginLeft": 8 };'],
  ['textAlign left', "const s = { textAlign: 'left' };"],
  ['textAlign right', "const s = { textAlign: 'right' };"],
  ['tailwind ml-', "const c = 'flex ml-2';"],
  ['tailwind pr- variant', "const c = 'md:pr-4';"],
  ['tailwind left-', "const c = 'absolute left-0';"],
  ['tailwind text-left', "const c = 'text-left';"],
  ['tailwind text-right', 'const c = "p-2 text-right";'],
  ['template literal', 'const c = `flex mr-${n}`;'],
  ['jsx className', 'const e = <div className="mr-2" />;'],
];

const good = [
  [
    'logical props',
    'const s = { marginStart: 8, paddingEnd: 8, start: 0, end: 0, borderStartWidth: 1 };',
  ],
  ['textAlign start', "const s = { textAlign: 'center', writingDirection: 'rtl' };"],
  ['logical tailwind', "const c = 'ms-2 pe-4 start-0 text-start text-end';"],
  ['unrelated words', "const c = 'flex-1 leftover text-lefty';"],
];

let failed = 0;

for (const [name, code] of bad) {
  const messages = await lint(code, 'bad.tsx');
  const hit = messages.some((m) => m.ruleId === 'no-restricted-syntax' && m.message === MESSAGE);
  if (!hit) {
    failed++;
    console.error(`FAIL (should be flagged): ${name}: ${code}`);
  }
}

for (const [name, code] of good) {
  const messages = await lint(code, 'good.tsx');
  if (messages.length > 0) {
    failed++;
    console.error(`FAIL (should be clean): ${name}: ${JSON.stringify(messages)}`);
  }
}

if (failed > 0) {
  console.error(`${failed} RTL rule check(s) failed`);
  process.exit(1);
}
console.log(`RTL rule OK (${bad.length} flagged, ${good.length} clean)`);
