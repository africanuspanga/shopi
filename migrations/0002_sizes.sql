-- Sizes (or any one option) per product, with stock per size: [{"label":"M","stock":3}, ...]. NULL means no sizes.
-- products.stock stays the total, so lists and sold-out checks keep working.
ALTER TABLE products ADD COLUMN sizes TEXT;
-- The size the buyer picked, copied onto the order line.
ALTER TABLE order_items ADD COLUMN variant TEXT;
