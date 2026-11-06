CREATE TABLE IF NOT EXISTS manual_qris_claims (
  invoice_id TEXT PRIMARY KEY REFERENCES invoices(id),
  claimed_reference TEXT NOT NULL,
  claimed_paid_at TEXT NOT NULL,
  payer_name TEXT,
  note TEXT,
  status TEXT NOT NULL CHECK(status IN ('SUBMITTED','VERIFIED','REJECTED')),
  verified_provider_reference TEXT,
  verified_amount_idr INTEGER,
  verified_paid_at TEXT,
  reviewer_reason TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS manual_qris_claims_status ON manual_qris_claims(status,created_at);
