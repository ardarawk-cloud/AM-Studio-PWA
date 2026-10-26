PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY CHECK(id='am-studio-comics-member'), name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IDR' CHECK(currency='IDR'), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS membership_prices (
  id TEXT PRIMARY KEY CHECK(id IN ('monthly','yearly')),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  amount_idr INTEGER NOT NULL CHECK(amount_idr>0), period_months INTEGER NOT NULL CHECK(period_months BETWEEN 1 AND 36),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_settings (
  id INTEGER PRIMARY KEY CHECK(id=1), provider TEXT NOT NULL DEFAULT 'SHOPEEPAY',
  checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK(checkout_enabled IN (0,1)),
  merchant_name TEXT NOT NULL, merchant_nmid TEXT NOT NULL, qr_type TEXT NOT NULL DEFAULT 'STATIC_REFERENCE',
  merchant_status TEXT NOT NULL DEFAULT 'API_UNVERIFIED', legal_entity_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  api_mode TEXT NOT NULL DEFAULT 'DISABLED' CHECK(api_mode IN ('DISABLED','SANDBOX','PRODUCTION')),
  premium_storage_verified INTEGER NOT NULL DEFAULT 0 CHECK(premium_storage_verified IN (0,1)),
  legal_version TEXT NOT NULL DEFAULT '2026-10-26', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISABLED')),
  terms_version TEXT NOT NULL, terms_accepted_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('MEMBER','ADMIN')), csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_limits (id TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id), price_id TEXT NOT NULL REFERENCES membership_prices(id),
  amount_idr INTEGER NOT NULL CHECK(amount_idr>0), currency TEXT NOT NULL CHECK(currency='IDR'),
  period_months INTEGER NOT NULL CHECK(period_months BETWEEN 1 AND 36),
  provider TEXT NOT NULL, provider_mode TEXT NOT NULL CHECK(provider_mode IN ('SANDBOX','PRODUCTION')),
  merchant_id TEXT NOT NULL, store_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('CREATING','PENDING','PAID','FAILED','EXPIRED','CANCELLED')),
  idempotency_key TEXT NOT NULL, qr_content TEXT, qr_url TEXT,
  expires_at TEXT NOT NULL, paid_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS invoices_user ON invoices(user_id,created_at);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id), order_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id), plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  period_months INTEGER NOT NULL, provider TEXT NOT NULL, provider_mode TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL, amount_idr INTEGER NOT NULL CHECK(amount_idr>0),
  fee_idr INTEGER CHECK(fee_idr IS NULL OR fee_idr>=0), refund_idr INTEGER NOT NULL DEFAULT 0 CHECK(refund_idr>=0),
  currency TEXT NOT NULL CHECK(currency='IDR'), paid_at TEXT NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(settlement_status IN ('UNKNOWN','PENDING','RECEIVED')),
  settlement_idr INTEGER, settled_at TEXT, settlement_reference TEXT, created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PAID' CHECK(status IN ('PAID','PARTIALLY_REFUNDED','REFUNDED')),
  UNIQUE(provider,provider_mode,provider_transaction_id), CHECK(refund_idr<=amount_idr)
);
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, invoice_id TEXT REFERENCES invoices(id),
  payload_hash TEXT NOT NULL, event_status TEXT NOT NULL, source TEXT NOT NULL,
  verified INTEGER NOT NULL CHECK(verified IN (0,1)), received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES membership_plans(id), starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  last_period_starts_at TEXT NOT NULL, last_payment_id TEXT REFERENCES payments(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_entitlements (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), invoice_id TEXT UNIQUE REFERENCES invoices(id),
  scope TEXT NOT NULL DEFAULT 'AM_STUDIO_CATALOG' CHECK(scope='AM_STUDIO_CATALOG'),
  starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reading_progress (
  user_id TEXT NOT NULL REFERENCES users(id), comic_id TEXT NOT NULL, episode INTEGER NOT NULL CHECK(episode>0),
  page INTEGER NOT NULL CHECK(page>0), updated_at TEXT NOT NULL, PRIMARY KEY(user_id,comic_id,episode)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id), comic_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,comic_id)
);
CREATE TABLE IF NOT EXISTS comic_access (
  comic_id TEXT NOT NULL, episode INTEGER NOT NULL CHECK(episode>=0),
  visibility TEXT NOT NULL CHECK(visibility IN ('FREE','PREMIUM')), preview_pages TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0 CHECK(verified IN (0,1)), updated_at TEXT NOT NULL,
  PRIMARY KEY(comic_id,episode), CHECK(visibility='FREE' OR verified=1)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
  before_json TEXT, after_json TEXT, reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL,
  reference TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, UNIQUE(user_id,type,reference)
);
INSERT OR IGNORE INTO membership_plans VALUES ('am-studio-comics-member','AM STUDIO Comics Member','IDR','2026-10-26T00:00:00.000Z');
INSERT OR IGNORE INTO membership_prices VALUES ('monthly','am-studio-comics-member',9900,1,1,'2026-10-26T00:00:00.000Z');
INSERT OR IGNORE INTO membership_prices VALUES ('yearly','am-studio-comics-member',99000,12,1,'2026-10-26T00:00:00.000Z');
INSERT OR IGNORE INTO billing_settings(id,merchant_name,merchant_nmid,updated_at)
VALUES(1,'ACM Store - Art','ID1026544770625','2026-10-26T00:00:00.000Z');

-- One payment row per invoice is the atomic activation gate. The trigger runs in
-- the same D1 transaction; concurrent payments read the latest subscription end.
CREATE TRIGGER IF NOT EXISTS paid_membership AFTER INSERT ON payments WHEN NEW.status='PAID'
BEGIN
 INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at,last_period_starts_at,last_payment_id,status,updated_at)
 VALUES('sub_'||NEW.user_id,NEW.user_id,NEW.plan_id,NEW.paid_at,(strftime('%Y-%m-',NEW.paid_at,'start of month','+'||NEW.period_months||' months') || printf('%02d', min(CAST(strftime('%d',NEW.paid_at) AS INTEGER),CAST(strftime('%d',NEW.paid_at,'start of month','+'||NEW.period_months||' months','+1 month','-1 day') AS INTEGER))) || substr(NEW.paid_at,11)),NEW.paid_at,NEW.id,'ACTIVE',NEW.created_at)
 ON CONFLICT(user_id) DO UPDATE SET
   starts_at=CASE WHEN subscriptions.ends_at>NEW.paid_at AND subscriptions.status='ACTIVE' THEN subscriptions.starts_at ELSE NEW.paid_at END,
   last_period_starts_at=CASE WHEN subscriptions.ends_at>NEW.paid_at AND subscriptions.status='ACTIVE' THEN subscriptions.ends_at ELSE NEW.paid_at END,
   ends_at=(strftime('%Y-%m-',CASE WHEN subscriptions.ends_at>NEW.paid_at AND subscriptions.status='ACTIVE' THEN subscriptions.ends_at ELSE NEW.paid_at END,'start of month','+'||NEW.period_months||' months') || printf('%02d', min(CAST(strftime('%d',CASE WHEN subscriptions.ends_at>NEW.paid_at AND subscriptions.status='ACTIVE' THEN subscriptions.ends_at ELSE NEW.paid_at END) AS INTEGER),CAST(strftime('%d',CASE WHEN subscriptions.ends_at>NEW.paid_at AND subscriptions.status='ACTIVE' THEN subscriptions.ends_at ELSE NEW.paid_at END,'start of month','+'||NEW.period_months||' months','+1 month','-1 day') AS INTEGER))) || substr(CASE WHEN subscriptions.ends_at>NEW.paid_at AND subscriptions.status='ACTIVE' THEN subscriptions.ends_at ELSE NEW.paid_at END,11)),
   last_payment_id=NEW.id,status='ACTIVE',updated_at=NEW.created_at;
 INSERT INTO member_entitlements(id,user_id,invoice_id,scope,starts_at,ends_at,created_at)
 SELECT 'ent_'||NEW.invoice_id,NEW.user_id,NEW.invoice_id,'AM_STUDIO_CATALOG',last_period_starts_at,ends_at,NEW.created_at
 FROM subscriptions WHERE user_id=NEW.user_id;
 UPDATE invoices SET status='PAID',paid_at=NEW.paid_at,updated_at=NEW.created_at WHERE id=NEW.invoice_id;
 INSERT INTO audit_logs(id,actor,action,target,after_json,reason,created_at)
 VALUES('paid_'||NEW.id,'PROVIDER','MEMBERSHIP_PAYMENT_VERIFIED',NEW.invoice_id,json_object('payment_id',NEW.id,'amount_idr',NEW.amount_idr,'provider_transaction_id',NEW.provider_transaction_id),'Verified provider transaction',NEW.created_at);
END;
