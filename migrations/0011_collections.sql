-- Collections: products the seller groups under a name ("Eid", "Under 30k"), in the seller's order, each with its own
-- link shopi.tz/<shop>/c/<slug>. They also show as filter chips on the shop.
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Set once from the name and kept on rename, so links already shared keep working. Unique in the shop.
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  -- An optional line under the name on its page.
  description TEXT NOT NULL DEFAULT '',
  -- Its place among the shop's collections: chips and the seller's list.
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX collections_shop_slug ON collections(shop_id, slug);

CREATE TABLE collection_products (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- The product's place in the collection, as the seller ordered them.
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, product_id)
);
CREATE INDEX collection_products_product ON collection_products(product_id);
