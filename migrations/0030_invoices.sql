-- Shopi Invoices (roadmap `v-invoices`, the founder's answers of 20 Nov 2026): invoices and quotes for anyone who bills
-- first and is paid later (freelancers, photographers, clearing and forwarding agents, consultants) and for every shop.
-- Taken over from Ankara (the founder's invoice app, closing): the totals, the kinds, the derived statuses, reminders.
-- shops.kind (0029) gains a third value, 'invoices', asked at setup ("I send invoices"); no change to the column.

-- How the business appears on its invoices and how clients pay it (JSON, src/lib/invoice.ts `BillSettings`): address,
-- email, VRN, VAT on new lines, bank details (free text: several accounts fit), payment terms, days to pay, currency,
-- language. NULL until saved once; the TIN stays in shops.tin and the Lipa Namba in shops.lipa_*.
ALTER TABLE shops ADD COLUMN bill TEXT;

-- The people and companies a business bills. An invoice keeps its own copy (invoices.client), so editing a client
-- later never rewrites what was sent.
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- Who to address ("Asha Mushi"); company is optional ("Bahari Logistics Ltd").
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  tin TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX clients_shop ON clients(shop_id, updated_at);

-- An invoice or a quote. Money is in cents of the document's currency (TSh 60,000 is 6000000), so US dollars keep
-- their cents. Overdue, expired, part paid and paid are worked out when read (src/lib/invoice.ts `invoiceState`),
-- never stored, so they can't go stale.
CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  -- 'invoice' or 'quote'.
  kind TEXT NOT NULL,
  -- Per shop and kind: INV-0001, QUO-0001.
  number INTEGER NOT NULL,
  -- The client's link is shopi.tz/i/<code>: random, never the number.
  code TEXT NOT NULL UNIQUE,
  client_id TEXT,
  -- JSON copy of the client as billed: name, company, phone, email, address, tin.
  client TEXT NOT NULL,
  -- The language the document is written in ('en' or 'sw'), chosen per invoice.
  lang TEXT NOT NULL DEFAULT 'en',
  currency TEXT NOT NULL DEFAULT 'TZS',
  issue_day TEXT NOT NULL,
  -- An invoice's due date; a quote's last valid day. NULL: due on receipt (invoice) or open (quote).
  due_day TEXT,
  -- The client's PO, a bill of lading or container number, a job name.
  reference TEXT NOT NULL DEFAULT '',
  -- JSON lines: [{ name, description, qty, unit, price, tax }], price in the currency's units, tax a percent.
  lines TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'none',
  discount_value REAL NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  -- Confirmed payments, kept equal to their sum (src/server/invoices.ts `recalcPaid`).
  paid INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '',
  -- Bank and mobile money details as printed on this document (seeded from shops.bill; a USD invoice can name the USD account).
  pay_details TEXT NOT NULL DEFAULT '',
  -- draft, sent, cancelled; a quote also accepted or declined.
  status TEXT NOT NULL DEFAULT 'draft',
  -- The quote this invoice was made from. "Which invoice did this quote become?" is the reverse lookup.
  parent_id TEXT,
  -- Made from an order or a booking.
  order_id TEXT,
  booking_id TEXT,
  sent_at INTEGER,
  -- First opened by someone other than the business.
  viewed_at INTEGER,
  accepted_at INTEGER,
  paid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX invoices_number ON invoices(shop_id, kind, number);
CREATE INDEX invoices_shop ON invoices(shop_id, kind, created_at);
CREATE INDEX invoices_client ON invoices(shop_id, client_id);
CREATE INDEX invoices_parent ON invoices(parent_id);

-- Money paid against an invoice: recorded by the business (cash, bank, mobile money), or a proof the client sent from
-- the link (the confirmation SMS), which waits for the business to confirm it. Only confirmed payments count.
CREATE TABLE invoice_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  shop_id TEXT NOT NULL,
  -- Cents, in the invoice's currency.
  amount INTEGER NOT NULL,
  -- mobile, bank, cash, other.
  method TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  -- The client's pasted SMS, the transaction id read from it, and what the check made of it (as on orders).
  sms TEXT,
  txn_id TEXT,
  check_result TEXT,
  -- 'client' (sent from the link) or 'shop' (recorded by the business).
  by TEXT NOT NULL,
  -- claimed (waits for the business), confirmed, rejected.
  status TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX invoice_payments_invoice ON invoice_payments(invoice_id, created_at);
CREATE INDEX invoice_payments_shop ON invoice_payments(shop_id, status);
-- One SMS transaction pays one invoice once.
CREATE UNIQUE INDEX invoice_payments_txn ON invoice_payments(shop_id, txn_id) WHERE txn_id IS NOT NULL AND status != 'rejected';
