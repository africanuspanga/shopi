-- The new setup (roadmap o-flow, decision n1; built 18 Nov 2026): five steps, one decision each.
-- setup_step: the furthest step a shop has passed (1 to 5; 5 = setup finished). NULL for shops opened before the new
-- setup, which never see it. The step shown is worked out from this and the shop's data (a product, a Lipa Namba).
ALTER TABLE shops ADD COLUMN setup_step INTEGER;

-- Each step passed: how (done or skipped; a step answered by data, such as an import, has no row) and the seconds the seller spent on its
-- screen, so /admin shows where sellers stop and how long each step takes. No personal data.
CREATE TABLE setup_steps (
  shop_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  outcome TEXT NOT NULL, -- done or skip
  seconds INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX setup_steps_shop ON setup_steps (shop_id, step);
