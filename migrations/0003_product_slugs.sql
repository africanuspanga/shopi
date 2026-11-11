-- Readable product links: shopi.tz/zee-store/gauni-la-jua instead of shopi.tz/zee-store/p/<id>.
-- Unique within a shop. Set once and kept when a product is renamed, so links already shared keep working.
-- NULL until set; such products fall back to their id, and /<shop>/p/<id> redirects to the readable link.
ALTER TABLE products ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX products_shop_slug ON products(shop_id, slug);
