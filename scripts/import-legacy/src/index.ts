// CLI: pnpm import-legacy --daily daily.csv [--weekly weekly.csv] [--attendance attendance.csv]
//      [--mapping mapping.json] [--execute] [--admin <email>] [--report report.json]
// Dry-run unless --execute. A missing mapping file is generated as a draft to review, nothing else.
// mapping.json and report.json hold students' names: by default they live in the git-ignored
// scripts/import-legacy/out/ (the repository is public).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import {
  buildMapping,
  planImport,
  toMappingFile,
  type LegacyData,
  type MappingFile,
} from './map.ts';
import { parseAttendanceCsv, parseDailyCsv, parseWeeklyCsv } from './parse.ts';
import { buildReport, formatSummary } from './report.ts';
import { executeImport, loadCatalog, resolveAdmin, type AuthConfig } from './run.ts';

const USAGE = `الاستعمال:
  pnpm import-legacy --daily daily.csv [--weekly weekly.csv] [--attendance attendance.csv] \\
    [--mapping mapping.json] [--execute] [--admin <بريد المدير>] [--report report.json]

بلا --execute يعمل معاينةً: لا يكتب شيئًا ويطبع ملخّصًا ويكتب report.json.
إن لم يوجد ملف الربط يُولَّد مسودةً لتراجعها ثم تعيد التشغيل.
ملف الربط والتقرير فيهما أسماء الطلاب: مكانهما الافتراضي scripts/import-legacy/out/
(مستثنى من git)؛ لا تضعهما في مكان آخر داخل المستودع.
البيئة: SUPABASE_DB_URL (افتراضيًا العنقود المحلي)، ولإنشاء الحسابات SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY
(أو IMPORT_AUTH_MODE=direct على العنقود المحلي فقط).`;

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/awrad';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = resolve(ROOT, 'scripts', 'import-legacy', 'out');

function writeOutput(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function authConfig(env: NodeJS.ProcessEnv, dbUrl: string): AuthConfig | undefined {
  if (env.IMPORT_AUTH_MODE === 'direct') {
    const host = new URL(dbUrl).hostname;
    if (!['127.0.0.1', 'localhost'].includes(host)) {
      throw new Error(
        'IMPORT_AUTH_MODE=direct للعنقود المحلي فقط؛ استعمل SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY',
      );
    }
    return { mode: 'direct' };
  }
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return { mode: 'gotrue', url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY };
  }
  return undefined;
}

async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      daily: { type: 'string' },
      weekly: { type: 'string' },
      attendance: { type: 'string' },
      mapping: { type: 'string' },
      report: { type: 'string' },
      admin: { type: 'string' },
      execute: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help || !(values.daily || values.weekly || values.attendance)) {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }
  // pnpm runs scripts from the package folder; paths are relative to where the command was typed.
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const read = (file: string | undefined) =>
    file ? readFileSync(resolve(cwd, file), 'utf8') : null;
  if (existsSync(resolve(ROOT, '.env'))) process.loadEnvFile(resolve(ROOT, '.env'));
  // As the DB scripts and tests: the local cluster unless SUPABASE_DB_URL says otherwise.
  const dbUrl = process.env.SUPABASE_DB_URL || LOCAL_DB_URL;
  const target = new URL(dbUrl);
  console.log(`قاعدة البيانات: ${target.hostname}:${target.port || '5432'}${target.pathname}`);

  const daily = read(values.daily);
  const weekly = read(values.weekly);
  const attendance = read(values.attendance);
  const rows: LegacyData = {
    daily: daily === null ? [] : parseDailyCsv(daily),
    weekly: weekly === null ? [] : parseWeeklyCsv(weekly),
    attendance: attendance === null ? [] : parseAttendanceCsv(attendance),
  };

  const auth = values.execute ? authConfig(process.env, dbUrl) : undefined;

  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  try {
    const catalog = await loadCatalog(db);
    const mappingPath = values.mapping
      ? resolve(cwd, values.mapping)
      : resolve(OUT_DIR, 'mapping.json');
    if (!existsSync(mappingPath)) {
      const draft = buildMapping(rows, catalog.habits, catalog.profiles, {
        groups: catalog.groups,
      });
      writeOutput(mappingPath, toMappingFile(draft));
      console.log(`كُتبت مسودة ملف الربط في ${mappingPath}`);
      console.log(
        'راجعها: الأسماء ذات القيمة null لن تُستورد حتى تضع معرّف ملف أو { "createMissingAsInactive": true }.',
      );
      for (const [name, suggestions] of Object.entries(draft.suggestions)) {
        const hint = suggestions.map((s) => `${s.fullName} (${s.profileId})`).join('، ');
        console.log(`  • ${name}${hint ? ` — هل هو: ${hint}؟` : ''}`);
      }
      return 0;
    }
    const file = JSON.parse(readFileSync(mappingPath, 'utf8')) as MappingFile;
    const mapping = buildMapping(rows, catalog.habits, catalog.profiles, {
      file,
      groups: catalog.groups,
    });
    const plan = planImport(rows, mapping);
    const result = values.execute
      ? await executeImport(plan, {
          dryRun: false,
          db,
          adminId: await resolveAdmin(db, values.admin),
          auth,
        })
      : await executeImport(plan, { dryRun: true });

    const files = Object.fromEntries(
      (['daily', 'weekly', 'attendance'] as const).flatMap((k) =>
        values[k] ? [[k, values[k]]] : [],
      ),
    );
    const report = buildReport(plan, result, { files });
    const reportPath = values.report
      ? resolve(cwd, values.report)
      : resolve(OUT_DIR, 'report.json');
    writeOutput(reportPath, report);
    console.log(formatSummary(report, reportPath));
    return result.failures.length > 0 ? 1 : 0;
  } finally {
    await db.end();
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`خطأ: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
