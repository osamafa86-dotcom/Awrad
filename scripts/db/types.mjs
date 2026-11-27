// Generates packages/supabase-client/src/database.types.ts from the local public schema.
// Path: `supabase gen types typescript --remote=<db-url>` (works without Docker, CLI >= 3.x), run from an
// empty temp workdir so the repo's supabase/config.jsonc is never read, then formatted with prettier so the
// committed file is readable and byte-stable across runs.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, dbUrl, loadEnv, run } from './lib.mjs';

loadEnv();
const outDir = join(ROOT, 'packages/supabase-client/src');
const out = join(outDir, 'database.types.ts');
mkdirSync(outDir, { recursive: true });

const workdir = mkdtempSync(join(tmpdir(), 'awrad-gen-types-'));
try {
  const raw = run(
    'supabase',
    [
      'gen',
      'types',
      'typescript',
      `--remote=${dbUrl()}`,
      '--schema',
      'public',
      '--workdir',
      workdir,
    ],
    { cwd: workdir },
  );
  const formatted = run(
    join(ROOT, 'node_modules/.bin/prettier'),
    ['--stdin-filepath', out, '--config', join(ROOT, 'packages/config/prettier.config.js')],
    { input: raw + '\n', stdio: ['pipe', 'pipe', 'inherit'] },
  );
  writeFileSync(out, formatted + '\n');
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
console.log(`wrote ${out.slice(ROOT.length + 1)}`);
