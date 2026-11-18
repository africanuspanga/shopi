-- AI that writes for sellers (roadmap ai-desc, 18 Nov 2026): one row per use, to keep each shop to its allowance (Free:
-- 10 descriptions a month, the founder; Tembo: unlimited, with a quiet 50 a day so a runaway script can't run up the
-- bill) and to count use on /admin. No text is stored. Rows older than about 13 months are deleted nightly.
CREATE TABLE ai_uses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  tokens INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_uses_shop ON ai_uses (shop_id, created_at);
