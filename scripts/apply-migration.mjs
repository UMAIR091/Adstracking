// Applies a SQL migration file to your Supabase Postgres using the connection
// string in .env (SUPABASE_DB_URL). Run: node scripts/apply-migration.mjs [file]
import { readFileSync } from "node:fs";
import { Client } from "pg";

function readEnv(key) {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const m = env.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
  return m ? m[1].trim() : null;
}

const connectionString = readEnv("SUPABASE_DB_URL");
if (!connectionString) {
  console.error("❌ SUPABASE_DB_URL not found in .env");
  process.exit(1);
}

const file = process.argv[2] || "supabase/migrations/0001_init.sql";
const sql = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log(`✅ Applied ${file} successfully.`);
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
