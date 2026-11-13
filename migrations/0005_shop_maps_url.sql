-- An optional Google Maps link for the shop, so buyers can get directions.
ALTER TABLE shops ADD COLUMN maps_url TEXT NOT NULL DEFAULT '';
