-- A shop's own domain (A10): www.myshop.co.tz pointed at Shopi with a CNAME, served through Cloudflare for SaaS custom
-- hostnames (src/server/domains.ts). One per shop. `status`: 'pending' (waiting for the seller's DNS and the
-- certificate), 'active' (serving the shop) or 'failed' (Cloudflare gave up; the seller can try again).
CREATE TABLE domains (
  hostname TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  -- Cloudflare's custom hostname id; NULL until Cloudflare has it.
  cf_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Cloudflare's own words for what is missing, shown to the seller as a hint.
  detail TEXT NOT NULL DEFAULT '',
  -- 1 once the hostname is on the bot check's list (Turnstile allows 10 per widget on the free plan).
  turnstile INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  checked_at INTEGER,
  active_at INTEGER
);
