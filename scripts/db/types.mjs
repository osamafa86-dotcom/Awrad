// Generates TypeScript types from the public schema. Needs packages/supabase-client (later task).
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, dbUrl, loadEnv, run } from './lib.mjs';

loadEnv();
const out = join(ROOT, 'packages/supabase-client/src/database.types.ts');
if (!existsSync(join(ROOT, 'packages/supabase-client/src'))) {
  throw new Error('packages/supabase-client/src does not exist yet (created in a later task)');
}
const types = run('supabase', ['gen', 'types', 'typescript', '--db-url', dbUrl(), '--schema', 'public']);
writeFileSync(out, types + '\n');
console.log(`wrote ${out.slice(ROOT.length + 1)}`);
