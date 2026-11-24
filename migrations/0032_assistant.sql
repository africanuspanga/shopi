-- The AI assistant for buyers (roadmap ai-buyer, 23 Nov 2026). The founder's rule: it is only an assistant and never
-- invasive. It never opens by itself; the buyer chooses to ask. It answers from the shop's own facts, and the buyer
-- confirms anything it does (putting a product in the bag, opening WhatsApp).

-- The seller's switch (on for every shop, the founder's decision of 18 Nov; Shop settings > AI assistant).
ALTER TABLE shops ADD COLUMN assistant INTEGER NOT NULL DEFAULT 1;

-- A buyer's chat with one shop's assistant. The seller reads every chat (and Shopi's owner on /admin). The id is the
-- only key: the buyer's browser keeps it for the visit. No name or phone number: phone numbers typed in a question are
-- hidden before anything is stored or sent to the model. Deleted 90 days after the last message (nightly job).
CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  -- The analytics visitor id (a random id on the buyer's phone), to count visitors, never a person.
  visitor_id TEXT,
  -- The product the buyer was looking at when the chat began.
  product_id TEXT,
  lang TEXT,
  -- The shop's own owner or assistant trying it out: shown as "You" in the log, not counted against a free shop.
  own INTEGER NOT NULL DEFAULT 0,
  -- The question count when the bot check last passed with a real token; NULL when the chat began without one
  -- (Cloudflare unreachable, an old phone). The check runs again every few questions (src/lib/api/assistant.ts).
  checked_q INTEGER,
  questions INTEGER NOT NULL DEFAULT 0,
  -- What the buyer did from it: put a product in the bag, opened WhatsApp.
  bag INTEGER NOT NULL DEFAULT 0,
  whatsapp INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX chats_shop ON chats (shop_id, updated_at);

-- Each message. `data` (JSON) holds what came with an answer: product cards, the offered action, an order's status,
-- and how it was answered (the model, a chip, an order code, a limit) with the checks that changed it.
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX chat_messages_chat ON chat_messages (chat_id, id);
CREATE INDEX chat_messages_shop ON chat_messages (shop_id, created_at);

-- Switches for all of Shopi that the owner changes on /admin without a deploy. First one: `assistant_off`.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
