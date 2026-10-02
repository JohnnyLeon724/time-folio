use crate::{db::Database, domain::*, services::backup};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub id: String,
    pub path: String,
    pub kind: String,
    pub created_at: i64,
}
#[derive(Clone)]
pub struct SnapshotService {
    pub db: Arc<Database>,
    pub directory: PathBuf,
}
impl SnapshotService {
    pub fn new(db: Arc<Database>, directory: PathBuf) -> Self {
        Self { db, directory }
    }
    pub fn create(&self, kind: &str) -> Result<SnapshotInfo> {
        if !["automatic", "pre-restore"].contains(&kind) {
            return Err(AppError::new("VALIDATION", "快照类型无效"));
        }
        std::fs::create_dir_all(&self.directory)?;
        let now = chrono::Utc::now().timestamp_millis();
        let name = format!(
            "timefolio-{kind}-{}-{}.db",
            chrono::Utc::now().format("%Y%m%dT%H%M%SZ"),
            id()
        );
        let path = self.directory.join(&name);
        let temp = tempfile::NamedTempFile::new_in(&self.directory)?;
        self.db.read(|c| {
            let mut destination = rusqlite::Connection::open(temp.path())?;
            {
                let b = rusqlite::backup::Backup::new(c, &mut destination)?;
                b.run_to_completion(128, Duration::from_millis(10), None)?;
            }
            verify(&destination)?;
            destination.close().map_err(|(_, e)| AppError::from(e))?;
            Ok(())
        })?;
        temp.as_file().sync_all()?;
        temp.persist_noclobber(&path)
            .map_err(|e| AppError::from(e.error))?;
        Ok(SnapshotInfo {
            id: name,
            path: path.to_string_lossy().into(),
            kind: kind.into(),
            created_at: now,
        })
    }
    pub fn list(&self) -> Result<Vec<SnapshotInfo>> {
        if !self.directory.exists() {
            return Ok(vec![]);
        }
        let mut result = vec![];
        for item in std::fs::read_dir(&self.directory)? {
            let item = item?;
            let name = item.file_name().to_string_lossy().into_owned();
            if item.file_type()?.is_file()
                && name.starts_with("timefolio-")
                && name.ends_with(".db")
            {
                let kind = if name.starts_with("timefolio-automatic-") {
                    "automatic"
                } else if name.starts_with("timefolio-pre-restore-") {
                    "pre-restore"
                } else {
                    continue;
                };
                let created_at = item
                    .metadata()?
                    .modified()?
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as i64;
                result.push(SnapshotInfo {
                    id: name,
                    path: item.path().to_string_lossy().into(),
                    kind: kind.into(),
                    created_at,
                });
            }
        }
        result.sort_by_key(|s| std::cmp::Reverse(s.created_at));
        Ok(result)
    }
    pub fn path(&self, snapshot_id: &str) -> Result<PathBuf> {
        if snapshot_id.contains(['/', '\\']) {
            return Err(AppError::new("VALIDATION", "快照标识无效"));
        }
        self.list()?
            .into_iter()
            .find(|s| s.id == snapshot_id)
            .map(|s| PathBuf::from(s.path))
            .ok_or_else(|| AppError::new("NOT_FOUND", "快照不存在"))
    }
    pub fn delete(&self, snapshot_id: &str) -> Result<()> {
        std::fs::remove_file(self.path(snapshot_id)?)?;
        Ok(())
    }
    pub fn extract(&self, snapshot_id: &str) -> Result<backup::Backup> {
        let c = rusqlite::Connection::open_with_flags(
            self.path(snapshot_id)?,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        verify(&c)?;
        let version: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != 1 {
            return Err(AppError::new("UNSUPPORTED_FORMAT", "快照数据库模式不兼容"));
        }
        backup::capture_snapshot(&c)
    }
    pub fn automatic(&self, now: i64) -> Result<Option<SnapshotInfo>> {
        let revision = self.db.revision()?;
        let info = self.db.read(|c| {
            let value = c.query_row(
                "SELECT value FROM device_settings WHERE key='last_snapshot'",
                [],
                |r| r.get::<_, String>(0),
            );
            Ok(value
                .ok()
                .and_then(|s| serde_json::from_str::<(String, i64)>(&s).ok()))
        })?;
        if info.is_some_and(|(ref r, t)| r == &revision || now - t < 3600000) {
            return Ok(None);
        }
        if self
            .db
            .read(|c| Ok(crate::db::records::all(c)?.is_empty()))?
        {
            return Ok(None);
        }
        let snap = self.create("automatic")?;
        self.db.internal(|tx|{tx.execute("INSERT INTO device_settings VALUES('last_snapshot',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[serde_json::to_string(&(revision,now))?])?;Ok(())})?;
        for old in self
            .list()?
            .into_iter()
            .filter(|s| s.kind == "automatic")
            .skip(7)
        {
            self.delete(&old.id)?;
        }
        Ok(Some(snap))
    }
}
pub fn verify(c: &rusqlite::Connection) -> Result<()> {
    let integrity: String = c.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(AppError::new("STORAGE", "数据库完整性检查失败"));
    }
    let mut stmt = c.prepare("PRAGMA foreign_key_check")?;
    if stmt.query([])?.next()?.is_some() {
        return Err(AppError::new("VALIDATION", "数据库引用不完整"));
    }
    Ok(())
}
pub fn preserve_corrupt(path: &Path) -> Result<PathBuf> {
    let destination = path.with_file_name(format!("timefolio-damaged-{}.db", id()));
    std::fs::copy(path, &destination)?;
    std::fs::File::open(&destination)?.sync_all()?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{suffix}", path.display()));
        if side.exists() {
            let copy = PathBuf::from(format!("{}{suffix}", destination.display()));
            std::fs::copy(&side, &copy)?;
            std::fs::File::open(copy)?.sync_all()?;
        }
    }
    Ok(destination)
}
