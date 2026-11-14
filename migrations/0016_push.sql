-- Notifications on the seller's phone (src/server/push.ts): one row per phone or browser where the seller turned them on.
-- endpoint, p256dh and auth come from the browser's PushSubscription. lang is the seller's language when they turned it on.
-- A row is deleted when the seller turns notifications off, or when the push service says the address is gone.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'sw',
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX push_subscriptions_shop ON push_subscriptions(shop_id);
