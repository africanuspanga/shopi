-- Which shop brought a seller to Shopi (roadmap q-footer): the id of the shop whose "Open your own shop" link they
-- followed (?ref=<slug>, kept 30 days in the shopi_ref cookie), NULL otherwise. Written once at sign-up; the seller
-- invite reward (roadmap `referral`) reads it later, and the owner dashboard counts it.
ALTER TABLE users ADD COLUMN ref_shop TEXT;
