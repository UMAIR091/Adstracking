// Verifies, against a real database, how report allowances are counted and
// protected (launch audit N2, migration 0040). The Free plan's monthly report
// and the trial's cap count usage_counters.reports_generated, so that counter
// must be unwritable by tenants, untouched when a report is deleted, and taken
// atomically when a report is produced.
//
// Nothing is kept. Every database probe runs inside one transaction that is
// rolled back, as a real signed-in owner (role authenticated plus
// request.jwt.claims, which is how PostgREST runs a request). A second
// connection checks the per-agency lock. The API probes use the public anon key
// and can't change anything.
//
//   node scripts/verify-report-usage-limit.mjs            probe the database as it is
//   node scripts/verify-report-usage-limit.mjs --dry-run  apply 0040 inside the
//                                                         transaction first
//
// Reads SUPABASE_DB_URL, and for the API probes NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY, from .env. Exits 1 when any probe fails.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATION = "supabase/migrations/0040_report_generation_allowance.sql";

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL not found in .env");
  process.exit(1);
}

const results = [];
const record = (name, verdict) => results.push({ name, pass: verdict === true, detail: verdict === true ? "" : String(verdict) });

// A refusal has to name the mechanism, so a probe can't pass on an unrelated error.
const TABLE_DENIED = /permission denied for table usage_counters/;
const FUNCTION_DENIED = /permission denied for function (reserve|release)_report_generation/;
const refused = (pattern) => (r) =>
  r.error
    ? r.error.code === "42501" && pattern.test(r.error.message) ? true : `wrong error ${r.error.code}: ${r.error.message}`
    : `ALLOWED (${r.rowCount} rows)`;
const rows = (check) => (r) => (r.error ? `error ${r.error.code}: ${r.error.message}` : check(r.rows));

const config = { connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "verify-report-usage-limit" };
const db = new Client(config);
const other = new Client(config);
await db.connect();
await other.connect();
await db.query("SET statement_timeout = '20s'; SET lock_timeout = '4s'; SET idle_in_transaction_session_timeout = '60s'");

async function actAs(who) {
  await db.query(`SET LOCAL ROLE ${who.role}`);
  await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
    JSON.stringify(who.uid ? { sub: who.uid, role: who.role } : { role: who.role }),
    who.uid ?? "",
  ]);
}

// Runs `setup` as the connection's own role, then the statement(s) as `who`,
// inside a savepoint that is always rolled back. With several statements,
// `params` is one array per statement and the last result is checked.
async function probe(name, { setup = [], who, sql, params = [], expect }) {
  await db.query("SAVEPOINT probe");
  let r;
  try {
    for (const s of setup) await db.query(s.sql, s.params);
    await actAs(who);
    const statements = Array.isArray(sql) ? sql : [sql];
    const allParams = Array.isArray(sql) ? params : [params];
    try {
      let last;
      for (let i = 0; i < statements.length; i++) last = await db.query(statements[i], allParams[i] ?? []);
      r = { rowCount: last.rowCount, rows: last.rows };
    } catch (error) {
      r = { error };
    }
  } catch (error) {
    r = { setupError: error };
  } finally {
    await db.query("ROLLBACK TO SAVEPOINT probe; RELEASE SAVEPOINT probe");
  }
  record(name, r.setupError ? `setup failed: ${r.setupError.message}` : expect(r));
}

const started = Date.now();
try {
  await db.query("BEGIN");
  if (DRY_RUN) {
    await db.query(readFileSync(new URL(`../${MIGRATION}`, import.meta.url), "utf8"));
    console.log(`Applied ${MIGRATION} inside the transaction; it is rolled back at the end.`);
  }

  // The agency with the most saved reports, so the delete probe has one to delete.
  const agency = (
    await db.query(`select a.id::text id, a.owner_id::text owner,
        (select count(*)::int from reports r where r.agency_id = a.id) reports
      from agencies a
     order by 3 desc, a.created_at
     limit 1`)
  ).rows[0];
  if (!agency) throw new Error("No agencies to probe with.");
  const owner = { role: "authenticated", uid: agency.owner };
  const server = { role: "service_role" };
  const anon = { role: "anon" };
  const month = (await db.query("select date_trunc('month', now() at time zone 'utc')::date::text m")).rows[0].m;
  const sumSql = "select coalesce(sum(count), 0)::int n from usage_counters where agency_id = $1 and metric = 'reports_generated'";
  const usedEver = (await db.query(sumSql, [agency.id])).rows[0].n;
  const usedThisMonth = (await db.query(`${sumSql} and period_month = $2::date`, [agency.id, month])).rows[0].n;

  const exists = (
    await db.query(`select to_regprocedure('public.reserve_report_generation(uuid,integer,boolean)') is not null reserve,
                           to_regprocedure('public.release_report_generation(uuid,date)') is not null release`)
  ).rows[0];
  const functions = exists.reserve && exists.release;
  record("migration 0040's functions exist", functions ? true : "reserve/release_report_generation missing: apply 0040 first");

  const grants = (
    await db.query(`select r.role, p.priv, has_table_privilege(r.role, 'public.usage_counters', p.priv) granted
        from (values ('anon'), ('authenticated')) r(role)
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)`)
  ).rows;
  const wrongGrants = grants.filter((g) => g.granted !== (g.priv === "SELECT")).map((g) => `${g.role} ${g.priv}=${g.granted}`);
  record("anon and authenticated may only read usage_counters", wrongGrants.length ? wrongGrants.join("; ") : true);
  const cmds = (await db.query("select string_agg(cmd, ',' order by cmd) v from pg_policies where schemaname = 'public' and tablename = 'usage_counters'")).rows[0].v;
  record("usage_counters policies are SELECT only", cmds === "SELECT" ? true : `policies: ${cmds}`);

  // Tenants can't touch the counter.
  await probe("owner cannot add to their usage counter", {
    who: owner,
    sql: "insert into usage_counters (agency_id, metric, period_month, count) values ($1, 'reports_generated', $2::date, 0) on conflict do nothing",
    params: [agency.id, month],
    expect: refused(TABLE_DENIED),
  });
  await probe("owner cannot reset their report count", {
    who: owner,
    sql: "update usage_counters set count = 0 where agency_id = $1 and metric = 'reports_generated'",
    params: [agency.id],
    expect: refused(TABLE_DENIED),
  });
  await probe("owner cannot delete their usage counters", {
    who: owner,
    sql: "delete from usage_counters where agency_id = $1",
    params: [agency.id],
    expect: refused(TABLE_DENIED),
  });
  await probe("anon cannot write usage_counters", {
    who: anon,
    sql: "update usage_counters set count = 0",
    expect: refused(TABLE_DENIED),
  });

  // Deleting a saved report, as the owner may, leaves the count alone.
  if (agency.reports > 0) {
    await probe("deleting a saved report leaves reports_generated unchanged", {
      who: owner,
      sql: [
        "delete from reports where id = (select id from reports where agency_id = $1 order by created_at limit 1)",
        `select (select count(*)::int from reports where agency_id = $1) reports, (${sumSql}) n`,
      ],
      params: [[agency.id], [agency.id]],
      expect: rows((r) =>
        r[0].reports === agency.reports - 1 && r[0].n === usedEver
          ? true
          : `reports ${r[0].reports} (was ${agency.reports}), counter ${r[0].n} (was ${usedEver})`
      ),
    });
  } else {
    console.log("Skipped the report-deletion probe: no agency has a saved report.");
  }

  if (functions) {
    await probe("owner cannot call reserve_report_generation", {
      who: owner,
      sql: "select reserve_report_generation($1, 1000, false)",
      params: [agency.id],
      expect: refused(FUNCTION_DENIED),
    });
    await probe("owner cannot call release_report_generation", {
      who: owner,
      sql: "select release_report_generation($1, $2::date)",
      params: [agency.id, month],
      expect: refused(FUNCTION_DENIED),
    });
    await probe("a reservation at the monthly limit is refused", {
      who: server,
      sql: "select reserve_report_generation($1, $2, false)::text m",
      params: [agency.id, usedThisMonth],
      expect: rows((r) => (r[0].m === null ? true : `granted ${r[0].m}`)),
    });
    await probe("a reservation under the limit counts exactly one generation", {
      who: server,
      sql: ["select reserve_report_generation($1, $2, false)", `${sumSql} and period_month = $2::date`],
      params: [[agency.id, usedThisMonth + 1], [agency.id, month]],
      expect: rows((r) => (r[0].n === usedThisMonth + 1 ? true : `counter ${r[0].n}, expected ${usedThisMonth + 1}`)),
    });
    await probe("the next request for that last slot is refused", {
      who: server,
      sql: ["select reserve_report_generation($1, $2, false)", "select reserve_report_generation($1, $2, false)::text m"],
      params: [[agency.id, usedThisMonth + 1], [agency.id, usedThisMonth + 1]],
      expect: rows((r) => (r[0].m === null ? true : `granted ${r[0].m}`)),
    });
    await probe("the trial cap counts generations from every month", {
      who: server,
      sql: "select reserve_report_generation($1, $2, true)::text m",
      params: [agency.id, usedEver],
      expect: rows((r) => (r[0].m === null ? true : `granted ${r[0].m}`)),
    });
    await probe("unlimited plans are always counted", {
      who: server,
      sql: "select reserve_report_generation($1, null, false)::text m",
      params: [agency.id],
      expect: rows((r) => (r[0].m === month ? true : `returned ${r[0].m}`)),
    });
    await probe("a report that never saved gives its generation back", {
      who: server,
      sql: ["select reserve_report_generation($1, null, false)", "select release_report_generation($1, $2::date)", `${sumSql} and period_month = $2::date`],
      params: [[agency.id], [agency.id, month], [agency.id, month]],
      expect: rows((r) => (r[0].n === usedThisMonth ? true : `counter ${r[0].n}, expected ${usedThisMonth}`)),
    });

    // The per-agency lock: while one transaction holds a reservation, a second
    // connection can't take the same lock.
    await db.query("SAVEPOINT lock_probe");
    try {
      await actAs(server);
      await db.query("select reserve_report_generation($1, null, false)", [agency.id]);
      const got = (await other.query("select pg_try_advisory_xact_lock(hashtextextended('report-usage:' || $1::text, 0)) got", [agency.id])).rows[0].got;
      record("a concurrent reservation for the same agency has to wait for the first", got === false ? true : "the second connection took the lock");
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT lock_probe; RELEASE SAVEPOINT lock_probe");
    }
    const freed = (await other.query("select pg_try_advisory_xact_lock(hashtextextended('report-usage:' || $1::text, 0)) got", [agency.id])).rows[0].got;
    record("the lock is released when that transaction ends", freed === true ? true : "still held");
  }
} catch (error) {
  record("run", `aborted: ${error.message}`);
} finally {
  await db.query("ROLLBACK").catch(() => undefined);
  await db.end();
  await other.end();
}

if (!DRY_RUN && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const zero = "00000000-0000-0000-0000-000000000000";
  const api = async (name, method, path, body, pattern) => {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}${path}`, { method, headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    record(name, json?.code === "42501" && pattern.test(json?.message ?? "") ? true : `HTTP ${res.status} ${JSON.stringify(json)}`);
  };
  await api("API: resetting usage_counters is refused", "PATCH", `/rest/v1/usage_counters?agency_id=eq.${zero}`, { count: 0 }, TABLE_DENIED);
  await api("API: calling reserve_report_generation is refused", "POST", "/rest/v1/rpc/reserve_report_generation", { p_agency: zero, p_limit: 1000, p_lifetime: false }, FUNCTION_DENIED);
  await api("API: calling release_report_generation is refused", "POST", "/rest/v1/rpc/release_report_generation", { p_agency: zero, p_period_month: "2026-01-01" }, FUNCTION_DENIED);
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed${DRY_RUN ? " (dry run)" : ""}; database changes rolled back after ${Date.now() - started} ms.`);
process.exit(failed ? 1 : 0);
