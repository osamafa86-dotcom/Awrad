// Limits of reading through PostgREST, shared by the reads in this folder.

/** ids per `.in()` filter, to keep the request URL short. */
export const IDS_PER_QUERY = 200;

/** Rows per request: PostgREST's `max_rows` (supabase/config.jsonc, and Supabase's default) caps a response at 1000. */
export const PAGE_SIZE = 1000;

/**
 * Every row of a query, one `.range()` page at a time, until a short page comes back: a single request
 * would be cut off at `max_rows` without an error. `page(from, to)` must order by a unique column so the
 * pages do not overlap.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
