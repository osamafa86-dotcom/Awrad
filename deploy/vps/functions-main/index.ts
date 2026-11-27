// Main service of the Supabase Edge Runtime on the VPS (the pattern of supabase/docker's
// volumes/functions/main/index.ts, kept small). Caddy strips /functions/v1, so a request arrives as
// /<function>/...; the function is /home/deno/functions/<function> (supabase/functions, mounted read-only).
// The JWT is checked here (HS256 with JWT_SECRET) before any worker starts, as verify_jwt does on Supabase.
import * as jose from 'npm:jose@5.9.6';

const FUNCTIONS = '/home/deno/functions';
const JWT_SECRET = Deno.env.get('JWT_SECRET') ?? '';
const VERIFY_JWT = Deno.env.get('VERIFY_JWT') !== 'false';
const SECRET = new TextEncoder().encode(JWT_SECRET);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function validJwt(req: Request): Promise<boolean> {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!match || !JWT_SECRET) return false;
  try {
    await jose.jwtVerify(match[1], SECRET, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const name = new URL(req.url).pathname.split('/')[1] ?? '';
  // Only plain function folders: no _shared, no hidden or traversing names.
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return json(404, { code: 'NOT_FOUND' });
  const servicePath = `${FUNCTIONS}/${name}`;
  if (!(await exists(`${servicePath}/index.ts`))) return json(404, { code: 'NOT_FOUND' });

  if (req.method !== 'OPTIONS' && VERIFY_JWT && !(await validJwt(req))) {
    return json(401, { code: 'INVALID_JWT' });
  }

  const importMap = `${servicePath}/deno.json`;
  const env = Deno.env.toObject();
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      importMapPath: (await exists(importMap)) ? importMap : null,
      envVars: Object.entries(env),
      memoryLimitMb: 150,
      workerTimeoutMs: 300000,
      cpuTimeSoftLimitMs: 10000,
      cpuTimeHardLimitMs: 20000,
      noModuleCache: false,
    });
    return await worker.fetch(req);
  } catch (error) {
    console.error(`main: ${name} failed`, error);
    return json(500, { code: 'FUNCTION_FAILED' });
  }
});
