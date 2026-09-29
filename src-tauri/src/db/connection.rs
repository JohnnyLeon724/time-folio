use crate::domain::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{de::DeserializeOwned, Serialize};
use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
    time::Duration,
};
pub struct Database {
    connection: Mutex<Connection>,
}
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        Self::initialize(Connection::open(path)?)
    }
    pub fn open_memory() -> Result<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }
    fn initialize(c: Connection) -> Result<Self> {
        c.busy_timeout(Duration::from_secs(5))?;
        c.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
        )?;
        let version: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 1 {
            return Err(AppError::new(
                "UNSUPPORTED_FORMAT",
                "数据库由较新版本创建，请更新应用",
            ));
        }
        c.execute_batch(include_str!("../../migrations/0001_initial.sql"))?;
        for (key, value) in [("workspace_id", id()), ("mutation_revision", id())] {
            c.execute(
                "INSERT OR IGNORE INTO app_metadata(key,value) VALUES(?1,?2)",
                params![key, value],
            )?;
        }
        c.execute(
            "INSERT OR IGNORE INTO settings(key,value) VALUES('portable',?1)",
            [serde_json::to_string(&Settings::default())?],
        )?;
        Ok(Self {
            connection: Mutex::new(c),
        })
    }
    fn lock(&self) -> Result<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| AppError::new("STORAGE", "存储锁不可用，请重新启动"))
    }
    pub fn read<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        {
            let guard = self.lock()?;
            f(&guard)
        }
    }
    pub fn revision(&self) -> Result<String> {
        self.read(|c| meta(c, "mutation_revision"))
    }
    pub fn settings(&self) -> Result<Settings> {
        self.read(settings)
    }
    pub fn mutate<T: Serialize + DeserializeOwned>(
        &self,
        ctx: MutationContext,
        digest: &str,
        now: i64,
        f: impl FnOnce(&Transaction) -> Result<T>,
    ) -> Result<MutationResult<T>> {
        if uuid::Uuid::parse_str(&ctx.request_id).is_err() {
            return Err(AppError::new("VALIDATION", "请求标识无效"));
        }
        let mut c = self.lock()?;
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let existing: Option<(String, String)> = tx
            .query_row(
                "SELECT digest,result FROM operation_receipts WHERE request_id=?1",
                [&ctx.request_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((old, payload)) = existing {
            if old != digest {
                return Err(AppError::new(
                    "STATE_CONFLICT",
                    "同一请求标识不能用于不同操作",
                ));
            }
            return Ok(serde_json::from_str(&payload)?);
        }
        if meta(&tx, "mutation_revision")? != ctx.workspace_revision {
            return Err(AppError::new("STALE_REVISION", "数据已更新，请刷新后重试"));
        }
        let value = f(&tx)?;
        let revision = id();
        tx.execute(
            "UPDATE app_metadata SET value=?1 WHERE key='mutation_revision'",
            [&revision],
        )?;
        let result = MutationResult {
            value,
            workspace_revision: revision,
        };
        tx.execute(
            "DELETE FROM operation_receipts WHERE created_at<?1",
            [now - 7 * 86400000],
        )?;
        tx.execute("INSERT INTO operation_receipts(request_id,digest,result,created_at) VALUES(?1,?2,?3,?4)",params![ctx.request_id,digest,serde_json::to_string(&result)?,now])?;
        tx.commit()?;
        Ok(result)
    }
    pub fn internal<T>(&self, f: impl FnOnce(&Transaction) -> Result<T>) -> Result<T> {
        let mut c = self.lock()?;
        let tx = c.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let result = f(&tx)?;
        tx.commit()?;
        Ok(result)
    }
}
pub fn meta(c: &Connection, key: &str) -> Result<String> {
    Ok(
        c.query_row("SELECT value FROM app_metadata WHERE key=?1", [key], |r| {
            r.get(0)
        })?,
    )
}
pub fn settings(c: &Connection) -> Result<Settings> {
    let s: String = c.query_row("SELECT value FROM settings WHERE key='portable'", [], |r| {
        r.get(0)
    })?;
    Ok(serde_json::from_str(&s)?)
}
