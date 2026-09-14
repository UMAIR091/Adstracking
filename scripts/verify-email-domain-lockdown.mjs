// Verifies, against a real database, that tenants can't write sending-domain
// verification state (launch audit N3, migration 0039). lib/email/sender.ts
// sends white-label mail from a domain only while its email_domains row says
// 'verified', so that row must be writable by the server alone.
//
// Nothing is kept. Every database probe runs inside one transaction that is
// rolled back, as a real signed-in owner (role authenticated plus
// request.jwt.claims, which is how PostgREST runs a request). No email is sent
// and Resend is never called. The API probes use the public anon key against
// an all-zero id, so they can't change anything either.
//
//   node scripts/verify-email-domain-lockdown.mjs            probe the database as it is
//   node scripts/verify-email-domain-lockdown.mjs --dry-run  apply 0039 inside the
//                                                            transaction first
//
// Reads SUPABASE_DB_URL, and for the API probes NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY, from .env. Exits 1 when any probe fails.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATION = "supabase/migrations/0039_email_domain_server_writes.sql";

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
const TABLE_DENIED = /permission denied for table email_domains/;
const refused = (r) =>
  r.error
    ? r.error.code === "42501" && TABLE_DENIED.test(r.error.message) ? true : `wrong error ${r.error.code}: ${r.error.message}`
    : `ALLOWED (${r.rowCount} rows)`;
const affected = (n) => (r) => (r.error ? `error ${r.error.code}: ${r.error.message}` : r.rowCount === n ? true : `${r.rowCount} rows, expected ${n}`);
const failsWith = (code) => (r) => (r.error?.code === code ? true : r.error ? `error ${r.error.code}: ${r.error.message}` : "no error");
const rows = (check) => (r) => (r.error ? `error ${r.error.code}: ${r.error.message}` : check(r.rows));

const db = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, application_name: "verify-email-domain-lockdown" });
await db.connect();
await db.query("SET statement_timeout = '20s'; SET lock_timeout = '4s'; SET idle_in_transaction_session_timeout = '60s'");

async function actAs(who) {
  await db.query(`SET LOCAL ROLE ${who.role}`);
  await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [
    JSON.stringify(who.uid ? { sub: who.uid, role: who.role } : { role: who.role }),
    who.uid ?? "",
  ]);
}

// Runs `setup` as the connection's own role, then one statement as `who`,
// inside a savepoint that is always rolled back.
async function probe(name, { setup = [], who, sql, params = [], expect }) {
  await db.query("SAVEPOINT probe");
  let r;
  try {
    for (const s of setup) await db.query(s.sql, s.params);
    await actAs(who);
    try {
      const q = await db.query(sql, params);
      r = { rowCount: q.rowCount, rows: q.rows };
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

  const agencies = (await db.query("select id::text id, owner_id::text owner from agencies order by created_at limit 2")).rows;
  if (agencies.length === 0) throw new Error("No agencies to probe with.");
  const [A, B] = agencies;
  const ownerA = { role: "authenticated", uid: A.owner };
  const ownerB = B ? { role: "authenticated", uid: B.owner } : null;
  const server = { role: "service_role" };
  const anon = { role: "anon" };
  const domain = `n3-probe-${Date.now()}.example`;
  // The row the domain route would have written after registering with Resend.
  const serverRow = {
    sql: "insert into email_domains (agency_id, domain, resend_domain_id, status) values ($1, $2, 'resend-id-from-server', 'pending')",
    params: [A.id, domain],
  };

  const cmds = (await db.query("select string_agg(cmd, ',' order by cmd) v from pg_policies where schemaname = 'public' and tablename = 'email_domains'")).rows[0].v;
  record("email_domains policies are SELECT and DELETE only", cmds === "DELETE,SELECT" ? true : `policies: ${cmds}`);
  const grants = (
    await db.query(`select r.role, p.priv, has_table_privilege(r.role, 'public.email_domains', p.priv) granted
        from (values ('anon'), ('authenticated')) r(role)
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)`)
  ).rows;
  const wrong = grants.filter((g) => g.granted !== ["SELECT", "DELETE"].includes(g.priv)).map((g) => `${g.role} ${g.priv}=${g.granted}`);
  record("anon and authenticated may only SELECT and DELETE email_domains", wrong.length ? wrong.join("; ") : true);
  const unique = (await db.query("select count(*)::int n from pg_indexes where tablename = 'email_domains' and indexdef ilike '%unique%lower(domain)%'")).rows[0].n;
  record("a sending domain can belong to only one workspace", unique === 1 ? true : "no unique index on lower(domain)");

  // Tenants can't create or change verification state.
  await probe("owner cannot insert a row marked verified", {
    who: ownerA,
    sql: "insert into email_domains (agency_id, domain, resend_domain_id, status) values ($1, $2, 'forged', 'verified')",
    params: [A.id, domain],
    expect: refused,
  });
  await probe("owner cannot upsert their row to verified", {
    who: ownerA,
    sql: "insert into email_domains (agency_id, domain, resend_domain_id, status) values ($1, $2, 'forged', 'verified') on conflict (agency_id) do update set status = 'verified'",
    params: [A.id, domain],
    expect: refused,
  });
  await probe("owner cannot set their server-written row to verified", {
    setup: [serverRow],
    who: ownerA,
    sql: "update email_domains set status = 'verified' where agency_id = $1",
    params: [A.id],
    expect: refused,
  });
  await probe("owner cannot point their row at another domain", {
    setup: [serverRow],
    who: ownerA,
    sql: "update email_domains set domain = 'tryreportflow.com' where agency_id = $1",
    params: [A.id],
    expect: refused,
  });
  await probe("owner cannot swap in another Resend domain id", {
    setup: [serverRow],
    who: ownerA,
    sql: "update email_domains set resend_domain_id = 'someone-elses-id' where agency_id = $1",
    params: [A.id],
    expect: refused,
  });
  await probe("anon cannot write email_domains", {
    who: anon,
    sql: "update email_domains set status = 'verified'",
    expect: refused,
  });

  // What members and the server still do.
  await probe("owner can still read their row", {
    setup: [serverRow],
    who: ownerA,
    sql: "select status from email_domains where agency_id = $1",
    params: [A.id],
    expect: rows((r) => (r.length === 1 && r[0].status === "pending" ? true : JSON.stringify(r))),
  });
  await probe("owner can still delete their row", {
    setup: [serverRow],
    who: ownerA,
    sql: "delete from email_domains where agency_id = $1",
    params: [A.id],
    expect: affected(1),
  });
  if (ownerB) {
    await probe("another workspace cannot see the row", {
      setup: [serverRow],
      who: ownerB,
      sql: "select count(*)::int n from email_domains where agency_id = $1",
      params: [A.id],
      expect: rows((r) => (r[0].n === 0 ? true : `${r[0].n} visible`)),
    });
    await probe("another workspace cannot delete the row", {
      setup: [serverRow],
      who: ownerB,
      sql: "delete from email_domains where agency_id = $1",
      params: [A.id],
      expect: affected(0),
    });
    await probe("the same domain cannot be registered for a second workspace", {
      setup: [serverRow],
      who: server,
      sql: "insert into email_domains (agency_id, domain, resend_domain_id, status) values ($1, upper($2), 'second-id', 'pending')",
      params: [B.id, domain],
      expect: failsWith("23505"),
    });
  }
  await probe("the server role can still write the row (the domain routes)", {
    who: server,
    sql: "insert into email_domains (agency_id, domain, resend_domain_id, status) values ($1, $2, 'resend-id', 'verified')",
    params: [A.id, domain],
    expect: affected(1),
  });
} catch (error) {
  record("run", `aborted: ${error.message}`);
} finally {
  await db.query("ROLLBACK").catch(() => undefined);
  await db.end();
}

if (!DRY_RUN && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const zero = "00000000-0000-0000-0000-000000000000";
  const api = async (name, method, path, body) => {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}${path}`, { method, headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    record(name, json?.code === "42501" && TABLE_DENIED.test(json?.message ?? "") ? true : `HTTP ${res.status} ${JSON.stringify(json)}`);
  };
  await api("API: PATCH email_domains status=verified is refused", "PATCH", `/rest/v1/email_domains?id=eq.${zero}`, { status: "verified" });
  await api("API: POST a verified email_domains row is refused", "POST", "/rest/v1/email_domains", {
    agency_id: zero,
    domain: "probe.example",
    resend_domain_id: "forged",
    status: "verified",
  });
}

for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed${DRY_RUN ? " (dry run)" : ""}; database changes rolled back after ${Date.now() - started} ms.`);
process.exit(failed ? 1 : 0);
