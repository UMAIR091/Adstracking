-- Adds "biweekly" to the report_schedules frequency check.
--
-- Smallest possible change: the column, its type and every existing row are
-- untouched; only the allowed set widens. Widening a CHECK constraint cannot
-- invalidate existing rows, so this is safe to apply while the current deploy
-- is still serving (weekly/monthly/quarterly rows keep validating).
--
-- Postgres has no "ALTER CHECK", so the constraint is dropped and recreated.
-- Both statements run in one implicit transaction.

alter table report_schedules
  drop constraint if exists report_schedules_frequency_check;

alter table report_schedules
  add constraint report_schedules_frequency_check
  check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly'));
