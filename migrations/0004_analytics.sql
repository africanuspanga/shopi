-- Analytics v2. Who visited (an anonymous visitor ID kept on the buyer's phone), in which visit (a session that
-- ends after 30 quiet minutes), from where (source and the seller's ?s= link tag), on what (device, city).
ALTER TABLE events ADD COLUMN visitor_id TEXT;
ALTER TABLE events ADD COLUMN session_id TEXT;
ALTER TABLE events ADD COLUMN link_tag TEXT;
-- What exactly happened: the share channel, the social network clicked, "quick" for quick add, and so on.
ALTER TABLE events ADD COLUMN detail TEXT;
ALTER TABLE events ADD COLUMN device TEXT;
ALTER TABLE events ADD COLUMN city TEXT;
CREATE INDEX events_shop_type ON events(shop_id, type, created_at);
CREATE INDEX events_shop_session ON events(shop_id, session_id);

-- Shares used to keep their channel in `source`. Seller shares get their own type, so they never count as buyers'.
UPDATE events SET type = 'seller_share' WHERE type = 'share' AND source = 'seller';
UPDATE events SET detail = source, source = '' WHERE type IN ('share', 'seller_share');

-- Where each order came from, so its money is credited to Instagram, TikTok, WhatsApp or a tagged link.
ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN link_tag TEXT;
ALTER TABLE orders ADD COLUMN visitor_id TEXT;
ALTER TABLE orders ADD COLUMN session_id TEXT;

-- Links a seller tags for one channel or post: shopi.tz/zee-store?s=bio
CREATE TABLE links (
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (shop_id, tag)
);
