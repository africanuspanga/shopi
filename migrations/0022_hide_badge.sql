-- Tembo can hide the "Shop made with Shopi" line on its buyer pages (17 Nov plan; Shop settings > Plan). Read through
-- can(plan, 'hideBadge') when a page is drawn, so a shop whose Tembo ends shows the line again without a write.
ALTER TABLE shops ADD COLUMN hide_badge INTEGER NOT NULL DEFAULT 0;
