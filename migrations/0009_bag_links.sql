-- Bag links, like Shopify's draft orders: the seller builds a bag for one buyer, with their own price per line,
-- and sends shopi.tz/<shop>/b/<code>. The buyer adds where to deliver and how they pay. A link works once, for 7 days.
CREATE TABLE bag_links (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  -- [{"productId","size","qty","price","name","image"}]. Prices are the seller's, fixed when the link is made;
  -- name and image are copies, so the seller's list still reads well if a product is deleted later.
  items TEXT NOT NULL,
  -- Optional: they fill in the buyer's checkout. The note is shown to the buyer on the bag.
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  -- 'open', 'used' (it became order_id) or 'cancelled'. An open link past expires_at has expired.
  status TEXT NOT NULL DEFAULT 'open',
  order_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX bag_links_shop ON bag_links(shop_id, created_at);
