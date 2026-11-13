-- Options: each of a product's options (usually sizes) may have its own price and its own photo, kept in products.sizes:
-- [{"label":"Red","stock":2,"price":70000,"image":"s/<shop>/<id>.webp"}]. Options without them work as before.
-- What buyers choose: NULL (size), 'colour', 'style', 'model' or 'flavour', so the shop says "Colour Red", not "Size Red".
ALTER TABLE products ADD COLUMN option_name TEXT;
-- The kind of option on an order line, copied from the product when the order is placed. NULL means size.
ALTER TABLE order_items ADD COLUMN option TEXT;
