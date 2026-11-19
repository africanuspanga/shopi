-- Shopi for services (roadmap `v-services`, the founder's answers of 19 Nov 2026): a salon, barber or consultant lists
-- services, clients pick a free time on the shop's link, and the business sees every booking in a diary.

-- What the shop shows first: 'products' or 'services' (asked at setup). A shop may hold both.
ALTER TABLE shops ADD COLUMN kind TEXT NOT NULL DEFAULT 'products';
-- Working days and hours, the break, how far ahead clients book, clients at once, confirm-each-booking (JSON, see
-- src/lib/booking.ts). NULL until the business has set its hours: clients can't book before that.
ALTER TABLE shops ADD COLUMN book TEXT;

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Minutes.
  duration INTEGER NOT NULL,
  price INTEGER NOT NULL,
  -- 1: the price reads "From TSh …".
  price_from INTEGER NOT NULL DEFAULT 0,
  -- Who does it ("Asha"), optional.
  by_name TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX services_shop ON services(shop_id, sort, created_at);

-- A booked time. `day` (YYYY-MM-DD) and the minutes are Tanzania time; `start_at` is the same moment in ms.
-- The service's name, length and price are copied, so a later edit doesn't rewrite what was booked.
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- The client's link is shopi.tz/bk/<code>: whoever holds it can cancel or move the booking.
  code TEXT NOT NULL UNIQUE,
  service_id TEXT,
  service_name TEXT NOT NULL,
  duration INTEGER NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  price_from INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  start_at INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  -- requested (waits for the business), confirmed, done, noshow, cancelled.
  status TEXT NOT NULL,
  -- 'client' or 'shop', once cancelled.
  cancelled_by TEXT,
  -- 'online' (the client booked on the link) or 'manual' (the business added a walk-in or a call).
  origin TEXT NOT NULL DEFAULT 'online',
  -- The client's visit, as on orders (analytics).
  source TEXT NOT NULL DEFAULT '',
  link_tag TEXT NOT NULL DEFAULT '',
  visitor_id TEXT,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX bookings_shop_day ON bookings(shop_id, day, start_min);
CREATE INDEX bookings_phone ON bookings(shop_id, customer_phone, start_at);

-- Time the business takes off: a whole day (start_min NULL) or part of one. No client can book into it.
CREATE TABLE book_blocks (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  start_min INTEGER,
  end_min INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX book_blocks_shop ON book_blocks(shop_id, day);
