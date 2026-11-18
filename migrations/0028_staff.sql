-- Shop assistants (roadmap t-staff, the founder's answers of 18 Nov 2026): up to 2 people besides the owner help run a
-- Tembo shop, each with a role (orders, products, manager) and their own login. The owner adds one by name and phone;
-- Shopi makes a one-time invite link the owner sends on WhatsApp, and the assistant sets their own password from it.
CREATE TABLE shop_staff (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- NULL until the invite is accepted.
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  -- SHA-256 of the invite link's code (the code itself is never stored); NULL once used.
  invite_hash TEXT,
  invite_until INTEGER,
  created_at INTEGER NOT NULL,
  joined_at INTEGER
);
CREATE INDEX shop_staff_shop ON shop_staff(shop_id);
-- One login helps run one shop.
CREATE UNIQUE INDEX shop_staff_user ON shop_staff(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX shop_staff_phone ON shop_staff(shop_id, phone);
CREATE UNIQUE INDEX shop_staff_invite ON shop_staff(invite_hash) WHERE invite_hash IS NOT NULL;
