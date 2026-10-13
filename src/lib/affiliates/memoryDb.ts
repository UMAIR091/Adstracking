// Test helper: a tiny in-memory stand-in for the supabase-js query builder,
// covering only what the affiliate code uses (select/eq/is/in/order/limit/
// maybeSingle/single/insert/update/upsert, thenable). Not used in production.
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

// `defaults` stands in for column defaults the migration declares.
export function memoryDb(tables: Record<string, Row[]> = {}, opts: { label?: string; defaults?: Record<string, Row> } = {}) {
  const writes: { client: string; table: string; op: string; payload: unknown }[] = [];
  const db: Record<string, Row[]> = tables;

  function from(table: string) {
    db[table] = db[table] ?? [];
    const filters: Filter[] = [];
    let op: "select" | "update" | "upsert" | "insert" = "select";
    let payload: Row | Row[] | null = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let returning = false;
    let orderBy: { col: string; asc: boolean } | null = null;

    const rows = () => db[table].filter((r) => filters.every((f) => f(r)));
    const exec = (): { data: unknown; error: null } => {
      if (op === "select") {
        let out = rows().map((r) => ({ ...r }));
        if (orderBy) {
          const { col, asc } = orderBy;
          out = out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
        }
        return { data: out, error: null };
      }
      if (op === "update") {
        const hit = rows();
        for (const r of hit) Object.assign(r, payload);
        return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      const list = Array.isArray(payload) ? payload : [payload as Row];
      const key = upsertOpts.onConflict;
      const written: Row[] = [];
      for (const p of list) {
        const clash = key ? db[table].find((r) => key.split(",").every((k) => r[k] === p[k])) : undefined;
        if (clash) {
          if (op === "upsert" && !upsertOpts.ignoreDuplicates) Object.assign(clash, p);
          continue;
        }
        const row = { id: `${table}_${db[table].length + 1}`, created_at: new Date().toISOString(), ...(opts.defaults?.[table] ?? {}), ...p };
        db[table].push(row);
        written.push(row);
      }
      return { data: returning ? written.map((r) => ({ ...r })) : null, error: null };
    };

    const chain: Record<string, unknown> = {
      select: () => { returning = op !== "select"; return chain; },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return chain; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return chain; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return chain; },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return chain; },
      lte: (c: string, v: unknown) => { filters.push((r) => String(r[c]) <= String(v)); return chain; },
      gte: (c: string, v: unknown) => { filters.push((r) => String(r[c]) >= String(v)); return chain; },
      lt: (c: string, v: unknown) => { filters.push((r) => String(r[c]) < String(v)); return chain; },
      order: (c: string, o?: { ascending?: boolean }) => { orderBy = { col: c, asc: o?.ascending !== false }; return chain; },
      limit: () => chain,
      update: (p: Row) => { op = "update"; payload = p; writes.push({ client: opts.label ?? "admin", table, op, payload: p }); return chain; },
      insert: (p: Row | Row[]) => { op = "insert"; payload = p; writes.push({ client: opts.label ?? "admin", table, op, payload: p }); return chain; },
      upsert: (p: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        op = "upsert"; payload = p; upsertOpts = o ?? {};
        writes.push({ client: opts.label ?? "admin", table, op, payload: p });
        return chain;
      },
      maybeSingle: async () => { const { data } = exec(); return { data: Array.isArray(data) ? data[0] ?? null : data, error: null }; },
      single: async () => { const { data } = exec(); return { data: Array.isArray(data) ? data[0] ?? null : data, error: null }; },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    };
    return chain;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from } as any, db, writes };
}
