-- Tembo billing through Selcom (roadmap `billing`, 18 Nov 2026), copied from CV Chap Chap's flow. A row is written
-- before Selcom is called; its id is the Selcom order id (SHOPI-…), the only way to tell Shopi's money apart in the
-- shared Driftmark account. Only the call that flips a row from pending to completed extends the shop's Tembo year
-- (src/server/billing.ts, completePayment). Kept as business records.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  user_id TEXT,
  amount INTEGER NOT NULL,
  -- The mobile money number paid from (255XXXXXXXXX).
  phone TEXT NOT NULL,
  -- pending, completed or failed.
  status TEXT NOT NULL DEFAULT 'pending',
  -- A Lipa Namba order made for this payment's id (when the PIN prompt didn't come).
  manual_for TEXT,
  -- The order's own Lipa number, paid by hand through *150*50*1#.
  payment_token TEXT,
  reference TEXT,
  transid TEXT,
  result TEXT,
  resultcode TEXT,
  reason TEXT,
  -- Selcom's last answer (JSON, cut to 4,000 characters), for support.
  raw TEXT,
  -- The end of Tembo this payment gave the shop.
  paid_until INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX payments_shop ON payments (shop_id, created_at);
CREATE INDEX payments_status ON payments (status, created_at);
CREATE INDEX payments_manual ON payments (manual_for) WHERE manual_for IS NOT NULL;

-- What happened to each payment: created, completed, failed, amount_mismatch, rechecked.
CREATE TABLE payment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT NOT NULL,
  type TEXT NOT NULL,
  -- start, status, webhook, reconcile, admin.
  source TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX payment_events_payment ON payment_events (payment_id, created_at);

-- Selcom callbacks already handled, so a repeated one does nothing.
CREATE TABLE webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  reference TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, event_id)
);

-- What the owner did by hand on /admin (re-check a payment; later: extend or change a plan).
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  shop_id TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
