PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS catalog_access_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  free_through_episode INTEGER NOT NULL DEFAULT 9 CHECK(free_through_episode BETWEEN 0 AND 999),
  verified INTEGER NOT NULL DEFAULT 1 CHECK(verified IN (0,1)),
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO catalog_access_settings VALUES(1,1,9,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT OR IGNORE INTO audit_logs(id,actor,action,target,after_json,reason,created_at)
VALUES('owner-preview-episodes-1-9-20261027','OWNER','CATALOG_PREVIEW_APPROVED','AM_STUDIO_CATALOG',
  '{"free_through_episode":9,"premium_from_episode":10}',
  'Owner directive: preview through episode 9. Existing R2 comic inventory audited: 96 objects, no episode 10 or later.',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS publisher_releases (
  id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, comic_id TEXT NOT NULL,
  episode INTEGER NOT NULL CHECK(episode BETWEEN 0 AND 999),
  manifest_sha256 TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PROCESSING','PUBLISHED','FAILED')),
  next_asset INTEGER NOT NULL DEFAULT 0, receipt_json TEXT, error_code TEXT,
  lease_token TEXT, lease_expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publisher_locks (
  comic_id TEXT NOT NULL, episode INTEGER NOT NULL, release_id TEXT NOT NULL REFERENCES publisher_releases(id),
  PRIMARY KEY(comic_id,episode)
);
CREATE INDEX IF NOT EXISTS publisher_releases_status ON publisher_releases(status,updated_at);
