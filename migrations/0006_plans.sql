-- Plans: every shop starts on a trial (14 days, or 30 once setup is done), then Twiga or Tembo, paid yearly.
-- trial_ends overrides the computed trial end; paid_until is set when a plan is paid.
ALTER TABLE shops ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE shops ADD COLUMN trial_ends INTEGER;
ALTER TABLE shops ADD COLUMN paid_until INTEGER;
-- Shops open before plans existed keep selling until 31 December 2026 (end of day, Tanzania time).
UPDATE shops SET trial_ends = 1798750799000 WHERE status = 'active';
