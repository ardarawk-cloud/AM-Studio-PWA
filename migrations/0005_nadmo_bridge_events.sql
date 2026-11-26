CREATE TABLE IF NOT EXISTS nadmo_bridge_events (
  event_id TEXT PRIMARY KEY,
  merchant_transaction_id TEXT NOT NULL UNIQUE,
  amount_idr INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  merchant_nmid TEXT NOT NULL,
  app_package TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING_AI','MATCHED','REVIEW_REQUIRED')),
  invoice_id TEXT REFERENCES invoices(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS nadmo_bridge_events_status ON nadmo_bridge_events(status,created_at);
