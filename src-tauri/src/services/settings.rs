use crate::{
    db::{records, Database},
    domain::*,
    platform::clock::Clock,
    services::reports::{report, zone},
};
use chrono::{Datelike, TimeZone};
use serde::Serialize;
use std::{
    collections::{BTreeSet, HashMap},
    sync::{Arc, Mutex},
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZonePreview {
    pub token: String,
    pub zone: String,
    pub revision: String,
    pub changes: Vec<serde_json::Value>,
    pub expires_at: i64,
}
pub struct SettingsService {
    db: Arc<Database>,
    clock: Arc<dyn Clock>,
    previews: Mutex<HashMap<String, ZonePreview>>,
}
impl SettingsService {
    pub fn new(db: Arc<Database>, clock: Arc<dyn Clock>) -> Self {
        Self {
            db,
            clock,
            previews: Mutex::new(HashMap::new()),
        }
    }
    pub fn preview(&self, new_zone: &str) -> Result<ZonePreview> {
        zone(new_zone)?;
        let mut preview = self.db.read(|c| {
            let entries = records::all(c)?;
            if entries
                .iter()
                .any(|e| e.status.active() && e.deleted_at.is_none())
            {
                return Err(AppError::new(
                    "ACTIVE_TIMER",
                    "请先结束当前任务再修改统计时区",
                ));
            }
            let old = crate::db::settings(c)?;
            let mut months = BTreeSet::new();
            for z in [&old.reporting_time_zone, new_zone] {
                let tz = zone(z)?;
                for e in &entries {
                    for s in &e.segments {
                        let a = tz.timestamp_millis_opt(s.start_at).single().unwrap();
                        let b = tz
                            .timestamp_millis_opt(s.end_at.unwrap_or(s.start_at))
                            .single()
                            .unwrap();
                        let mut m = a.year() * 12 + a.month0() as i32;
                        let last = b.year() * 12 + b.month0() as i32;
                        while m <= last {
                            months.insert(format!("{:04}-{:02}", m / 12, m % 12 + 1));
                            m += 1;
                        }
                    }
                }
            }
            let mut changes = vec![];
            for month in months {
                let old_ms = report(&entries, &month, &old.reporting_time_zone)?.duration_ms;
                let new_ms = report(&entries, &month, new_zone)?.duration_ms;
                if old_ms != new_ms {
                    changes.push(
                        serde_json::json!({"month":month,"beforeMs":old_ms,"afterMs":new_ms}),
                    );
                }
            }
            Ok(ZonePreview {
                token: id(),
                zone: new_zone.into(),
                revision: crate::db::meta(c, "mutation_revision")?,
                changes,
                expires_at: self.clock.utc_now() + 600000,
            })
        })?;
        // Bounded previews: one settings dialog is supported at a time.
        let mut previews = self.previews.lock().unwrap();
        previews.clear();
        preview.token = id();
        previews.insert(preview.token.clone(), preview.clone());
        Ok(preview)
    }
    pub fn apply(&self, ctx: MutationContext, token: &str) -> Result<MutationResult<Settings>> {
        let preview = self
            .previews
            .lock()
            .unwrap()
            .get(token)
            .cloned()
            .ok_or_else(|| AppError::new("STALE_PREVIEW", "请重新预览时区变化"))?;
        let now = self.clock.utc_now();
        if preview.expires_at <= now || preview.revision != ctx.workspace_revision {
            return Err(AppError::new("STALE_PREVIEW", "预览已过期，请重新预览"));
        }
        let result = self.db.mutate(ctx, &format!("zone:{token}"), now, |tx| {
            if records::all(tx)?
                .iter()
                .any(|e| e.status.active() && e.deleted_at.is_none())
            {
                return Err(AppError::new("ACTIVE_TIMER", "请先结束当前任务"));
            }
            let settings = Settings {
                reporting_time_zone: preview.zone,
                week_starts_on: 1,
                confirmed: true,
            };
            tx.execute(
                "UPDATE settings SET value=?1 WHERE key='portable'",
                [serde_json::to_string(&settings)?],
            )?;
            Ok(settings)
        })?;
        Ok(result)
    }
}
