import { isStaff } from '@/lib/access';
import { toCsv } from '@/lib/csv';
import { exportFilename, parseExportQuery } from '@/lib/export-query';
import { loadExport } from '@/lib/supabase/export';
import { fetchProfile } from '@/lib/supabase/profile';
import { createClient } from '@/lib/supabase/server';

function json(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * F-65 (EXP-1): GET /api/export?kind=daily|weekly|attendance&from=&to=&group= → the period's records as
 * an Excel-ready CSV. Staff only (401 signed out, 403 otherwise); the rows are what RLS lets the caller
 * read with their own session, so a supervisor gets their groups' people whatever group they ask for.
 */
export async function GET(request: Request): Promise<Response> {
  let client: Awaited<ReturnType<typeof createClient>>;
  let userId: string;
  try {
    client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return json(401, 'UNAUTHENTICATED');
    userId = data.user.id;
  } catch {
    // An unreachable auth server counts as signed out, as everywhere in the dashboard.
    return json(401, 'UNAUTHENTICATED');
  }

  if (!isStaff(await fetchProfile(client, userId))) return json(403, 'FORBIDDEN');

  const query = parseExportQuery(new URL(request.url).searchParams);
  if (!query.ok) return json(400, 'INVALID_QUERY');

  let csv: string;
  try {
    const table = await loadExport(client, query.data);
    csv = toCsv(table.rows, table.headers);
  } catch (error) {
    // Server log only; the download shows the JSON error.
    console.error('export: load failed', error);
    return json(500, 'EXPORT_FAILED');
  }

  const filename = exportFilename(query.data);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
