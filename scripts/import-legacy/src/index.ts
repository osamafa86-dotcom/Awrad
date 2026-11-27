// CLI: pnpm import-legacy --daily daily.csv [--weekly weekly.csv] [--attendance attendance.csv]
//      [--mapping mapping.json] [--execute] [--admin <email>] [--report report.json] [--counts-only]
// Dry-run unless --execute. A missing mapping file is generated as a draft to review, nothing else.
// mapping.json and report.json hold students' names: by default they live in the git-ignored
// scripts/import-legacy/out/ (the repository is public), written with mode 600.
// On the server it runs as the compose `import` service (Ruling FIN-5, docs/runbook.md): the database comes from
// the libpq variables PGHOST/PGUSER/PGPASSWORD/PGDATABASE, and --counts-only keeps names out of the output.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { executeImport, findExistingLogs, loadCatalog, resolveAdmin, type AuthConfig } from './run.ts';

const USAGE = `الاستعمال:
  pnpm import-legacy --daily daily.csv [--weekly weekly.csv] [--attendance attendance.csv] \\
    [--mapping mapping.json] [--execute] [--admin <بريد المدير>] [--report report.json] [--counts-only]

بلا --execute يعمل معاينةً: لا يكتب شيئًا ويطبع ملخّصًا ويكتب report.json.
لا يستبدل سجلًّا موجودًا أبدًا: يتركه ويذكره في الملخّص والتقرير.
‎--counts-only يطبع الأعداد وحدها (بلا أسماء ولا قيم)؛ التفاصيل في report.json.
إن لم يوجد ملف الربط يُولَّد مسودةً لتراجعها ثم تعيد التشغيل.
ملف الربط والتقرير فيهما أسماء الطلاب: مكانهما الافتراضي scripts/import-legacy/out/
(مستثنى من git)؛ لا تضعهما في مكان آخر داخل المستودع.
البيئة: SUPABASE_DB_URL، أو متغيّرات libpq ‏PGHOST/PGUSER/PGPASSWORD/PGDATABASE (افتراضيًا العنقود المحلي)،
ولإنشاء الحسابات SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY (أو IMPORT_AUTH_MODE=direct على العنقود المحلي فقط).`;

const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54329/awrad';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT_DIR = resolve(ROOT, 'scripts', 'import-legacy', 'out');

function writeOutput(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  // Names inside: owner-only (chmod as well, for a file an earlier run created).
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

/**
 * Where to connect: SUPABASE_DB_URL; else the libpq variables when PGHOST is set (the compose `import` service:
 * no password inside a URL, so any character in it works); else the local cluster.
 */
function dbTarget(env: NodeJS.ProcessEnv): { config: pg.ClientConfig; host: string; label: string } {
  if (env.SUPABASE_DB_URL) {
    const url = new URL(env.SUPABASE_DB_URL);
    return {
      config: { connectionString: env.SUPABASE_DB_URL },
      host: url.hostname,
      label: `${url.hostname}:${url.port || '5432'}${url.pathname}`,
    };
  }
  if (env.PGHOST) {
    return {
      config: {}, // pg reads PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE itself
      host: env.PGHOST,
      label: `${env.PGHOST}:${env.PGPORT || '5432'}/${env.PGDATABASE || env.PGUSER || ''}`,
    };
  }
  const url = new URL(LOCAL_DB_URL);
  return { config: { connectionString: LOCAL_DB_URL }, host: url.hostname, label: `${url.hostname}:${url.port}${url.pathname}` };
}

function authConfig(env: NodeJS.ProcessEnv, host: string): AuthConfig | undefined {
  if (env.IMPORT_AUTH_MODE === 'direct') {
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
      'counts-only': { type: 'boolean', default: false },
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
  // As the DB scripts and tests: the local cluster unless SUPABASE_DB_URL (or PGHOST) says otherwise.
  const target = dbTarget(process.env);
  console.log(`قاعدة البيانات: ${target.label}`);
  const countsOnly = values['counts-only'];

  const daily = read(values.daily);
  const weekly = read(values.weekly);
  const attendance = read(values.attendance);
  const rows: LegacyData = {
    daily: daily === null ? [] : parseDailyCsv(daily),
    weekly: weekly === null ? [] : parseWeeklyCsv(weekly),
    attendance: attendance === null ? [] : parseAttendanceCsv(attendance),
  };

  const auth = values.execute ? authConfig(process.env, target.host) : undefined;

  const db = new pg.Client(target.config);
  await db.connect();
  try {
    const catalog = await loadCatalog(db);
    const mappingPath = values.mapping
      ? resolve(cwd, values.mapping)
      : resolve(OUT_DIR, 'mapping.json');
    if (!existsSync(mappingPath)) {
      const draft = buildMapping(rows, catalog.habits, catalog.profiles, {
        groups: catalog.groups,
        weeklyGraceDays: catalog.weeklyGraceDays,
      });
      writeOutput(mappingPath, toMappingFile(draft));
      console.log(`كُتبت مسودة ملف الربط في ${mappingPath}`);
      console.log(
        'راجعها: الأسماء ذات القيمة null لن تُستورد حتى تضع معرّف ملف أو { "createMissingAsInactive": true }.',
      );
      const undecided = Object.entries(draft.suggestions);
      if (countsOnly) console.log(`أسماء تنتظر قرارك: ${undecided.length}`);
      else {
        for (const [name, suggestions] of undecided) {
          const hint = suggestions.map((s) => `${s.fullName} (${s.profileId})`).join('، ');
          console.log(`  • ${name}${hint ? ` — هل هو: ${hint}؟` : ''}`);
        }
      }
      return 0;
    }
    const file = JSON.parse(readFileSync(mappingPath, 'utf8')) as MappingFile;
    const mapping = buildMapping(rows, catalog.habits, catalog.profiles, {
      file,
      groups: catalog.groups,
      weeklyGraceDays: catalog.weeklyGraceDays,
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
    // The dry run's writes stay at zero; this read shows which logs the execute run would leave alone (FIN-9).
    if (!values.execute) result.skippedExisting = await findExistingLogs(db, plan);

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
    console.log(formatSummary(report, reportPath, { countsOnly }));
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
