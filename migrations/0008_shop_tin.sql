-- Optional TIN from TRA, stored as 9 digits and shown as 123-456-789 in the shop's info and on receipts.
ALTER TABLE shops ADD COLUMN tin TEXT NOT NULL DEFAULT '';
