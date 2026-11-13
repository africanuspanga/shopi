-- Back-in-stock alerts: a buyer leaves a WhatsApp number on a sold-out product or option. Shopi has no WhatsApp Business API
-- yet, so the seller sends each message from their own WhatsApp (a prefilled wa.me link) and marks it done.
-- An alert is deleted once the seller has told the buyer, and after 90 days at most (see the Privacy page).
CREATE TABLE stock_alerts (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- The option wanted (a size, a colour), or '' for the product itself.
  variant TEXT NOT NULL DEFAULT '',
  -- +255… as normalizePhone() writes it.
  phone TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX stock_alerts_once ON stock_alerts(product_id, variant, phone);
CREATE INDEX stock_alerts_shop ON stock_alerts(shop_id, product_id);
CREATE INDEX stock_alerts_age ON stock_alerts(created_at);
