-- Email to sellers through Resend (roadmap o-email, decision n11: optional, on Home and in Shop settings; built 18 Nov
-- 2026). Nothing is asked at sign-up, and nothing is asked to confirm it (the founder): it works once saved.
-- email: the address the seller gave (lower case); email_ok: when it was saved (ms), NULL when there is none.
-- email_lang: the language their emails are written in (the app's when they added it).
-- email_weekly / email_news: the summary each Monday and news from Shopi, 1 when chosen.
-- email_key: a random key for the links in emails (stop the summary, "not you? remove this address"), which work
-- without logging in; a new one with each new address.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_ok INTEGER;
ALTER TABLE users ADD COLUMN email_lang TEXT;
ALTER TABLE users ADD COLUMN email_weekly INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_news INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN email_key TEXT;

-- Every email Shopi tried to send: which kind, to whom (the user, not the address), and how it went. No bodies.
-- status: sent, failed, held (EMAIL_LIVE off and not an admin), dry (no Resend key, local). About 13 months.
CREATE TABLE email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX email_log_at ON email_log (created_at);
CREATE INDEX email_log_user ON email_log (user_id, kind, created_at);
