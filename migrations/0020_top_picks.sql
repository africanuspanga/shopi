-- Top picks (roadmap q-picks, decision n6): up to four products the seller puts first, shown to buyers in a band above
-- the shop's grid. pick_rank is 1 to 4 in the seller's order, NULL for every other product. Written only by writePicks
-- (src/server/picks.ts), which clears the shop's ranks and sets them again 1..n in one batch, so they stay compact.
ALTER TABLE products ADD COLUMN pick_rank INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS products_pick ON products (shop_id, pick_rank) WHERE pick_rank IS NOT NULL;
