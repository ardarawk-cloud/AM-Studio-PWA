CREATE TABLE IF NOT EXISTS receipt_ai_reviews (
  invoice_id TEXT PRIMARY KEY REFERENCES invoices(id),
  receipt_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('AI_CONSISTENT_NOT_VERIFIED','MISMATCH','AI_INCONCLUSIVE','AI_UNAVAILABLE')),
  reason TEXT NOT NULL,
  extracted_amount_idr INTEGER,
  extracted_reference TEXT,
  model TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),
  reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS receipt_ai_reviews_status ON receipt_ai_reviews(status,reviewed_at);
