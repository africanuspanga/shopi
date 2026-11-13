-- Sales the seller records by hand (source = 'manual'): in person, by phone, inside a WhatsApp chat.
-- stock_taken: 0 when the seller chose not to take the sale from stock, so cancelling it gives nothing back.
ALTER TABLE orders ADD COLUMN stock_taken INTEGER NOT NULL DEFAULT 1;
