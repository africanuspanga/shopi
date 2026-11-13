-- Discount codes: the seller makes a code, buyers type it at checkout. A percent or a fixed amount off the items,
-- with an optional minimum order, last day and number of uses, and an on/off switch.
CREATE TABLE discounts (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Uppercase letters, digits and hyphens, unique in the shop: EID10, KARIBU-2026.
  code TEXT NOT NULL,
  -- 'percent' (value 1 to 100) or 'amount' (value in TSh).
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  -- The items total an order must reach, in TSh. NULL: any order.
  min_order INTEGER,
  -- The last moment the code works: the end of a day, Tanzania time. NULL: no end.
  ends_at INTEGER,
  -- How many orders may use it; cancelled orders don't count. NULL: no limit.
  max_uses INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX discounts_shop_code ON discounts(shop_id, code);

-- The code an order used and the shillings it took off: total = subtotal - discount + delivery_fee.
ALTER TABLE orders ADD COLUMN discount_code TEXT;
ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;
CREATE INDEX orders_discount ON orders(shop_id, discount_code) WHERE discount_code IS NOT NULL;
