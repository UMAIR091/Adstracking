// Read-only Paddle sandbox check: confirms the API key authenticates and that
// every configured price id exists, is active, and has the billing cycle and
// amount our catalog expects. Creates nothing.
import { readFileSync } from "node:fs";

const envPath = process.argv[2];
const raw = readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  if (/^\s*#/.test(line)) continue;
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (!m) continue;
  let v = (m[2] ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const key = env.PADDLE_API_KEY;
if (!key) { console.error("No PADDLE_API_KEY"); process.exit(1); }

// Sandbox keys are prefixed pdl_sdbx_; live are pdl_live_.
const sandbox = key.startsWith("pdl_sdbx");
const base = sandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
console.log(`Environment : ${sandbox ? "SANDBOX" : "LIVE"}  (${base})`);
console.log(`Webhook secret: ${env.PADDLE_WEBHOOK_SECRET ? "set" : "MISSING"}`);
console.log(`Client token  : ${env.PADDLE_CLIENT_TOKEN ? "set" : "MISSING"}\n`);

// Catalog expectations mirror src/lib/billing/config.ts. Keep these two in
// sync with CATALOG and ANNUAL_MONTHS_CHARGED there — this script exists to
// catch the case where the Paddle catalog and the app disagree.
const ANNUAL_MONTHS_CHARGED = 10; // yearly price = 10x monthly ("2 months free")
const EXPECT = [
  ["Pro",      "PRO",      49],
  ["Pro Plus", "PRO_PLUS", 95],
  ["Growth",   "GROWTH",  149],
  ["Agency",   "AGENCY",  299],
];

async function getPrice(id) {
  const res = await fetch(`${base}/prices/${encodeURIComponent(id)}?include=product`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.error?.detail ?? body?.error?.code ?? `HTTP ${res.status}`;
    return { ok: false, detail };
  }
  return { ok: true, price: body.data };
}

let failures = 0;
for (const [label, envKey, monthly] of EXPECT) {
  for (const [interval, suffix, expectCycle, expectAmount] of [
    ["monthly", "MONTHLY", "month", monthly],
    ["yearly", "YEARLY", "year", monthly * ANNUAL_MONTHS_CHARGED],
  ]) {
    const id = env[`PADDLE_${envKey}_${suffix}_PRICE_ID`] ?? env[`PADDLE_PRICE_${envKey}_${suffix}`];
    const tag = `${label} ${interval}`.padEnd(20);

    if (!id) { console.log(`${tag} MISSING env var`); failures++; continue; }

    const r = await getPrice(id);
    if (!r.ok) { console.log(`${tag} ${id}  ERROR: ${r.detail}`); failures++; continue; }

    const p = r.price;
    const cycle = p.billing_cycle?.interval ?? "none";
    const freq = p.billing_cycle?.frequency ?? "?";
    const amount = Number(p.unit_price?.amount ?? 0) / 100;
    const currency = p.unit_price?.currency_code ?? "?";
    const product = p.product?.name ?? p.product_id ?? "?";

    const issues = [];
    if (p.status !== "active") issues.push(`status=${p.status}`);
    if (cycle !== expectCycle || String(freq) !== "1") issues.push(`cycle=${freq} ${cycle} (want 1 ${expectCycle})`);
    if (currency !== "USD") issues.push(`currency=${currency}`);
    if (Math.abs(amount - expectAmount) > 0.5) issues.push(`amount=${amount} (catalog says ${expectAmount})`);

    const verdict = issues.length ? `MISMATCH: ${issues.join(", ")}` : "OK";
    console.log(`${tag} ${id}  ${String(amount).padStart(6)} ${currency}/${cycle}  ${product.slice(0, 22).padEnd(22)} ${verdict}`);
    if (issues.length) failures++;
  }
}

console.log(`\n${failures === 0 ? "All prices verified." : `${failures} problem(s) found.`}`);
process.exit(failures === 0 ? 0 : 1);
