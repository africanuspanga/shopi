-- Checkout v2 (the founder, 17 Nov 2026): the area picker goes; the buyer types their area, may share a map pin, and
-- the old "Nearby landmark" becomes an optional note for the rider (it stays in `orders.landmark`).
-- A pin is cleared 90 days after the order by the nightly job (Privacy page); the area and the note stay.
ALTER TABLE orders ADD COLUMN lat REAL;
ALTER TABLE orders ADD COLUMN lng REAL;
-- How close the pin is, in metres, when it came from the phone's GPS; NULL for a pasted link.
ALTER TABLE orders ADD COLUMN pin_m INTEGER;

-- Delivery areas are information on the shop page only. Buyers ask "mikoani mnatuma?", so a shop says whether it sends
-- to other regions, with an optional line on how ("By bus, paid before sending").
ALTER TABLE shops ADD COLUMN ships_regions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shops ADD COLUMN regions_note TEXT NOT NULL DEFAULT '';

-- The nightly job finds pins to clear without reading every order.
CREATE INDEX orders_pinned ON orders(created_at) WHERE lat IS NOT NULL;
