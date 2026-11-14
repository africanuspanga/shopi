-- Attempts counted for rate limits and the login lock (src/server/limits.ts): one row per attempt, kept a day at most
-- (the nightly job deletes older ones). `key` names what is counted, like 'login:+255754123456' or 'signup-ip:1.2.3.4'.
CREATE TABLE limits (
  key TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX limits_key_at ON limits(key, at);
