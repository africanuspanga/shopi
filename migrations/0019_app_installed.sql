-- The seller app on the Home Screen: when this account last opened Shopi as an installed app (display-mode standalone),
-- and on what (android, ios, other). NULL = never seen installed. Written by markAppInstalled (src/lib/api/push.ts),
-- at most once a week per phone; shown on the owner dashboard.
ALTER TABLE users ADD COLUMN app_seen_at INTEGER;
ALTER TABLE users ADD COLUMN app_platform TEXT;
