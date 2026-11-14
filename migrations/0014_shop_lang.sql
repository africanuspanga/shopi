-- The language buyers see a shop in: 'sw' (Kiswahili) or 'en' (English). The seller chooses it when opening the shop
-- and can change it in Shop settings. Shops opened before this stay in English until their seller chooses.
ALTER TABLE shops ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
