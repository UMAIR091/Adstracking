-- ─────────────────────────────────────────────────────────────
-- 0047: Drop the per-client token columns from data_sources
--
-- 0046 moved every connection's tokens to a shared agency sign-in
-- (connections) and kept these columns only so the deploy before it kept
-- working during rollout. Since then they have held stale encrypted copies
-- that nothing reads, still visible (as ciphertext) to tenants, who can read
-- data_sources. Sign-ins hold the only copy now, readable by the service role
-- alone.
--
-- Checked before applying (17 Oct 2026): every data_sources row is linked to
-- a sign-in, no function or view references these columns, and production's
-- scheduled sync worker synced every healthy source through the sign-ins
-- (6 of 6; the one revoked source stayed revoked).
--
-- Apply AFTER the deploy that stops reading them (the reverse of 0046's
-- order): the previous deploy still selects them. Safe to re-run.
-- ─────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from data_sources where connection_id is null) then
    raise exception 'data_sources rows without a sign-in still exist; re-run the 0046 backfill first';
  end if;
end $$;

alter table data_sources
  drop column if exists access_token,
  drop column if exists refresh_token,
  drop column if exists token_expires_at,
  drop column if exists token_lock_token,
  drop column if exists token_locked_until;
