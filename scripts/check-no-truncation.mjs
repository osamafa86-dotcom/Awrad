#!/usr/bin/env node
// Fails when the apps clamp text to one line without a `// why:` (DESIGN.md §7 rule 9): `numberOfLines={1}`
// in the mobile app, the Tailwind `truncate` / `line-clamp-1` / `text-ellipsis` classes on the web.
// Usage: node scripts/check-no-truncation.mjs [dir ...]   (defaults to the mobile app's src and app; the
// admin lint passes apps/admin/app apps/admin/src)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { findTruncations } = require('./no-truncation.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = process.argv.length > 2 ? process.argv.slice(2) : ['apps/mobile/src', 'apps/mobile/app'];
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE.test(name)) yield full;
  }
}

const problems = [];
for (const dir of dirs) {
  const abs = path.resolve(root, dir);
  for (const file of walk(abs)) {
    for (const line of findTruncations(readFileSync(file, 'utf8'))) {
      problems.push(`${path.relative(root, file)}:${line}`);
    }
  }
}

if (problems.length > 0) {
  console.error('A one-line clamp (numberOfLines={1}, truncate, line-clamp-1, text-ellipsis) cuts text (DESIGN.md §7 rule 9). Let it wrap, or add `// why:` on the line:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`no-truncation: OK (${dirs.join(', ')})`);
