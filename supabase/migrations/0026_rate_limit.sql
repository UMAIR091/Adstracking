-- ─────────────────────────────────────────────────────────────
-- 0026: Durable rate limiter  (audit #3)
--
-- No application-layer rate limiting existed. Rather than add a paid dependency
-- (Upstash/Redis), we use a Postgres fixed-window counter — durable across
-- serverless invocations and regions, and atomic under concurrency.
--
-- rate_limit_hit(key, limit, window_seconds) upserts the counter for the current
-- window bucket and returns whether the caller is still under the limit. The
-- bucket is derived from the window so old buckets are simply never read again;
-- a periodic purge (purge_rate_limits) keeps the table small.
-- ─────────────────────────────────────────────────────────────

create table if not exists rate_limits (
  bucket_key text primary key,          -- "<key>:<window_start_epoch>"
  count      integer not null default 0,
  expires_at timestamptz not null
);
create index if not exists rate_limits_expires_idx on rate_limits (expires_at);

-- No RLS grants for tenants — this table is server-only. RLS on (defense in
-- depth) with no policy = deny all to anon/authenticated.
alter table rate_limits enable row level security;

-- Returns true if the request is ALLOWED (i.e. was within the limit), false if
-- it should be throttled. Atomic: the INSERT ... ON CONFLICT DO UPDATE runs as a
-- single statement, so concurrent callers increment the same row safely.
create or replace function rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start bigint := (extract(epoch from now())::bigint / p_window_seconds) * p_window_seconds;
  v_bucket text := p_key || ':' || v_window_start;
  v_count int;
begin
  insert into rate_limits (bucket_key, count, expires_at)
  values (v_bucket, 1, to_timestamp(v_window_start + p_window_seconds))
  on conflict (bucket_key)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- Housekeeping: drop expired buckets. Called opportunistically by the cron.
create or replace function purge_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limits where expires_at < now() - interval '1 hour';
$$;

revoke all on function rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke all on function purge_rate_limits() from public, anon, authenticated;
grant execute on function rate_limit_hit(text, int, int) to service_role;
grant execute on function purge_rate_limits() to service_role;
