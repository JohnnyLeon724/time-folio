CREATE TABLE IF NOT EXISTS work_entries (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, note TEXT, source TEXT NOT NULL CHECK(source IN ('manual','timer')),
 status TEXT NOT NULL CHECK(status IN ('running','paused','needs_review','completed')),
 version INTEGER NOT NULL CHECK(version>0), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
 CHECK(deleted_at IS NULL OR status NOT IN ('running','paused'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_entry ON work_entries((1)) WHERE deleted_at IS NULL AND status IN ('running','paused');
CREATE TABLE IF NOT EXISTS work_segments (id TEXT PRIMARY KEY,entry_id TEXT NOT NULL REFERENCES work_entries(id) ON DELETE CASCADE,start_at INTEGER NOT NULL,end_at INTEGER,CHECK(end_at IS NULL OR end_at>start_at));
CREATE INDEX IF NOT EXISTS segments_entry ON work_segments(entry_id);
CREATE TABLE IF NOT EXISTS review_items (id TEXT PRIMARY KEY,entry_id TEXT NOT NULL REFERENCES work_entries(id) ON DELETE CASCADE,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS device_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS timer_runtime (singleton INTEGER PRIMARY KEY CHECK(singleton=1),entry_id TEXT NOT NULL REFERENCES work_entries(id) ON DELETE CASCADE,segment_id TEXT NOT NULL,last_checkpoint_at INTEGER NOT NULL,process_session_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operation_receipts (request_id TEXT PRIMARY KEY,digest TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL);
PRAGMA user_version=1;
