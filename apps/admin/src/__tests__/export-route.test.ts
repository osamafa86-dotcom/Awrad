import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const fetchProfile = vi.fn();
const loadExport = vi.fn();
const client = { auth: { getUser } };

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/profile', () => ({ fetchProfile: (...args: unknown[]) => fetchProfile(...args) }));
vi.mock('@/lib/supabase/export', () => ({ loadExport: (...args: unknown[]) => loadExport(...args) }));

import { GET } from '../../app/api/export/route';

const admin = { id: 'a1', role: 'admin', isActive: true, fullName: 'المدير', groupId: null };
const QUERY = 'kind=daily&from=2026-11-01&to=2026-11-30';

function get(query = QUERY) {
  return GET(new Request(`http://localhost/api/export?${query}`));
}

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'a1' } }, error: null });
  fetchProfile.mockResolvedValue(admin);
  loadExport.mockResolvedValue({ headers: ['الطالب'], rows: [{ الطالب: 'أحمد' }] });
});

describe('GET /api/export', () => {
  it('signed out is a 401 JSON, without reading anything', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no session' } });
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHENTICATED' });
    expect(loadExport).not.toHaveBeenCalled();
  });

  it('an unreachable auth server counts as signed out', async () => {
    getUser.mockRejectedValue(new Error('fetch failed'));
    expect((await get()).status).toBe(401);
  });

  it.each([
    ['a student', { ...admin, role: 'student' }],
    ['an inactive supervisor', { ...admin, role: 'supervisor', isActive: false }],
    ['a user without a profile row', null],
  ])('%s gets a 403', async (_, profile) => {
    fetchProfile.mockResolvedValue(profile);
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'FORBIDDEN' });
    expect(loadExport).not.toHaveBeenCalled();
  });

  it('a bad query is a 400', async () => {
    const res = await get('kind=daily&from=2026-11-30&to=2026-11-01');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'INVALID_QUERY' });
    expect(loadExport).not.toHaveBeenCalled();
  });

  it('a staff member gets the CSV as an attachment, read with their own client (RLS scopes the rows)', async () => {
    const res = await get(`${QUERY}&group=all`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="awrad-daily-2026-11-01_2026-11-30.csv"; filename*=UTF-8''awrad-daily-2026-11-01_2026-11-30.csv`,
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    // The UTF-8 BOM (EF BB BF) is the first thing in the file.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toBe('"الطالب"\r\n"أحمد"\r\n');
    expect(loadExport).toHaveBeenCalledWith(client, { kind: 'daily', from: '2026-11-01', to: '2026-11-30', group: 'all' });
  });

  it('a failed read is a 500 JSON', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadExport.mockRejectedValue(new Error('db down'));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'EXPORT_FAILED' });
  });
});
