-- A shop may change its link (the founder, 23 Nov 2026: "why can't we allow them to change … as long as it's
-- available"). Its former links are kept here: each one sends buyers on to the shop's link of today (links in bios,
-- printed QR codes, old WhatsApp messages), and is never given to another shop.
CREATE TABLE shop_links (
  slug TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX shop_links_shop ON shop_links(shop_id);
