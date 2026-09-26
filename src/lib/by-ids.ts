/**
 * Runs a `.in(ids)` query in chunks of 100 ids and joins the rows. A long id list otherwise makes the
 * request URL too long (the query fails) and a single response is capped at 1000 rows.
 */
export async function selectByIds<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>,
  size = 100,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  const results = await Promise.all(chunks.map((c) => run(c)));
  const rows: T[] = [];
  for (const r of results) {
    if (r.error) throw r.error;
    rows.push(...((r.data ?? []) as T[]));
  }
  return rows;
}
