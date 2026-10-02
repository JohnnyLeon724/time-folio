use crate::{
    db::{records, Database},
    domain::*,
    platform::clock::Clock,
    services::{
        backup::{self, Backup},
        snapshots::SnapshotService,
    },
};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::Read,
    path::Path,
    sync::{Arc, Mutex},
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub token: String,
    pub entry_count: usize,
    pub segment_count: usize,
    pub review_count: usize,
    pub deleted_count: usize,
    pub duration_ms: i64,
    pub reporting_time_zone: String,
    pub exported_at: String,
    pub replaces_local: bool,
    pub expires_at: i64,
    pub source_version: String,
    pub coverage_start: Option<i64>,
    pub coverage_end: Option<i64>,
    pub report_comparison: Vec<String>,
}
#[derive(Clone)]
struct Staged {
    backup: Backup,
    revision: String,
    preview: RestorePreview,
}
pub struct RestoreService {
    db: Arc<Database>,
    clock: Arc<dyn Clock>,
    pub snapshots: SnapshotService,
    staged: Mutex<HashMap<String, Staged>>,
}
impl RestoreService {
    pub fn new(db: Arc<Database>, clock: Arc<dyn Clock>, snapshots: SnapshotService) -> Self {
        Self {
            db,
            clock,
            snapshots,
            staged: Mutex::new(HashMap::new()),
        }
    }
    pub fn inspect(&self, path: &Path) -> Result<RestorePreview> {
        let mut bytes = vec![];
        std::fs::File::open(path)?
            .take(50 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        self.stage(backup::parse(&bytes, self.clock.utc_now())?)
    }
    pub fn inspect_snapshot(&self, id: &str) -> Result<RestorePreview> {
        self.stage(self.snapshots.extract(id)?)
    }
    pub fn stage(&self, backup: Backup) -> Result<RestorePreview> {
        backup::validate(&backup, self.clock.utc_now())?;
        let entries = backup.entries()?;
        let isolated = Database::open_memory()?;
        isolated.internal(|tx| {
            for e in &entries {
                records::put(tx, e)?;
            }
            crate::services::snapshots::verify(tx)
        })?;
        let (revision, replaces_local) = self.db.read(|c| {
            Ok((
                crate::db::meta(c, "mutation_revision")?,
                !records::all(c)?.is_empty(),
            ))
        })?;
        let mut comparison = vec![];
        if backup.time_zone_data_version.as_deref() != Some(chrono_tz::IANA_TZDB_VERSION) {
            comparison.push(format!(
                "源时区数据版本：{}；当前版本：{}。恢复后按当前时区规则重算，请核对历史月份。",
                backup.time_zone_data_version.as_deref().unwrap_or("未记录"),
                chrono_tz::IANA_TZDB_VERSION
            ));
        }
        let recalculated =
            super::reports::month_totals(&entries, &backup.portable_settings.reporting_time_zone)?;
        let mut months = std::collections::BTreeSet::new();
        for total in backup.report_summaries.iter().chain(recalculated.iter()) {
            months.insert(total.month.clone());
        }
        if !backup.report_summaries.is_empty() {
            for month in months {
                let source = backup
                    .report_summaries
                    .iter()
                    .find(|r| r.month == month)
                    .map_or(0, |r| r.duration_ms);
                let current = recalculated
                    .iter()
                    .find(|r| r.month == month)
                    .map_or(0, |r| r.duration_ms);
                if source != current {
                    comparison.push(format!("{}：源文件参考合计 {} 毫秒，当前重算 {} 毫秒。正式报表仅使用当前重算结果。",month,source,current));
                }
            }
        }
        let preview = RestorePreview {
            token: id(),
            entry_count: entries.len(),
            segment_count: backup.work_segments.len(),
            review_count: entries
                .iter()
                .filter(|e| e.status == Status::NeedsReview && e.deleted_at.is_none())
                .count(),
            deleted_count: entries.iter().filter(|e| e.deleted_at.is_some()).count(),
            duration_ms: entries
                .iter()
                .filter(|e| e.status == Status::Completed && e.deleted_at.is_none())
                .map(|e| e.duration())
                .sum(),
            reporting_time_zone: backup.portable_settings.reporting_time_zone.clone(),
            exported_at: backup.exported_at.clone(),
            replaces_local,
            expires_at: self.clock.utc_now() + 600000,
            source_version: backup.app_version.clone(),
            coverage_start: backup.work_segments.iter().map(|s| s.start_at).min(),
            coverage_end: backup.work_segments.iter().filter_map(|s| s.end_at).max(),
            report_comparison: comparison,
        };
        let mut staged = self.staged.lock().unwrap();
        staged.clear();
        staged.insert(
            preview.token.clone(),
            Staged {
                backup,
                revision,
                preview: preview.clone(),
            },
        );
        Ok(preview)
    }
    pub fn apply(
        &self,
        ctx: MutationContext,
        token: &str,
        confirmed: bool,
    ) -> Result<MutationResult<serde_json::Value>> {
        if let Some(receipt) = self
            .db
            .receipt(&ctx.request_id, &format!("restore:{token}"))?
        {
            return Ok(receipt);
        }
        let staged = self
            .staged
            .lock()
            .unwrap()
            .get(token)
            .cloned()
            .ok_or_else(|| AppError::new("STALE_PREVIEW", "请重新选择并预览备份"))?;
        let now = self.clock.utc_now();
        if staged.preview.expires_at <= now || staged.revision != ctx.workspace_revision {
            return Err(AppError::new("STALE_PREVIEW", "本地数据已变化或预览已过期"));
        }
        if staged.preview.replaces_local && !confirmed {
            return Err(AppError::new("VALIDATION", "请明确确认替换本地数据"));
        }
        // Check revision before snapshot, then recheck inside mutate after snapshot completion.
        self.db.read(|c| {
            if crate::db::meta(c, "mutation_revision")? != staged.revision {
                return Err(AppError::new("STALE_PREVIEW", "本地数据已变化"));
            }
            if records::all(c)?.iter().any(|e| e.status.active()) {
                return Err(AppError::new("ACTIVE_TIMER", "请先结束计时或保留为待核对"));
            }
            Ok(())
        })?;
        let safety = self.snapshots.create("pre-restore")?;
        let result=self.db.mutate(ctx,&format!("restore:{token}"),now,|tx|{
  if records::all(tx)?.iter().any(|e|e.status.active()){return Err(AppError::new("ACTIVE_TIMER","请先结束计时"));}
  tx.execute("DELETE FROM timer_runtime",[])?;tx.execute("DELETE FROM work_entries",[])?;tx.execute("DELETE FROM operation_receipts",[])?;
  for e in staged.backup.entries()?{records::put(tx,&e)?;}
  let settings=Settings{reporting_time_zone:staged.backup.portable_settings.reporting_time_zone.clone(),week_starts_on:staged.backup.portable_settings.week_starts_on,confirmed:true};
  tx.execute("UPDATE settings SET value=?1 WHERE key='portable'",[serde_json::to_string(&settings)?])?;tx.execute("UPDATE app_metadata SET value=?1 WHERE key='workspace_id'",[&staged.backup.workspace_id])?;
  crate::services::snapshots::verify(tx)?;Ok(serde_json::json!({"entryCount":staged.preview.entry_count,"safetySnapshot":safety.path}))})?;
        Ok(result)
    }
}
