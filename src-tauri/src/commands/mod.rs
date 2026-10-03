use crate::{
    db::{records, Database},
    domain::*,
    platform::{clock::SystemClock, lifecycle::LifecycleService},
    services::{
        backup, csv, entries::EntryService, recovery::RecoveryService, reports,
        restore::RestoreService, settings::SettingsService, snapshots::SnapshotService,
        timer::TimerService,
    },
};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{Emitter, Manager};
pub struct Controller {
    pub timer: TimerService,
    pub entries: EntryService,
    pub recovery: Arc<RecoveryService>,
    pub settings: SettingsService,
    pub snapshots: SnapshotService,
    pub restore: RestoreService,
    pub lifecycle: LifecycleService,
    pub tray_ready: AtomicBool,
    pub allow_exit: AtomicBool,
}
impl Controller {
    pub fn new(directory: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&directory)?;
        let db = Arc::new(Database::open(&directory.join("timefolio.db"))?);
        db.read(crate::services::snapshots::verify)?;
        let clock = Arc::new(SystemClock::default());
        let timer = TimerService::new(db.clone(), clock.clone());
        let recovery = Arc::new(RecoveryService::new(timer.clone()));
        recovery.recover_on_startup()?;
        let snapshots = SnapshotService::new(db.clone(), directory.join("snapshots"));
        Ok(Self {
            entries: EntryService::new(timer.clone()),
            settings: SettingsService::new(db.clone(), clock.clone()),
            restore: RestoreService::new(db, clock, snapshots.clone()),
            snapshots,
            lifecycle: LifecycleService::new(timer.clone()),
            timer,
            recovery,
            tray_ready: AtomicBool::new(false),
            allow_exit: AtomicBool::new(false),
        })
    }
    pub fn run(&self, op: &str, input: Value) -> Result<Value> {
        let ctx = || {
            serde_json::from_value::<MutationContext>(
                input.get("context").cloned().unwrap_or(Value::Null),
            )
            .map_err(AppError::from)
        };
        let text = |key: &str| {
            input
                .get(key)
                .and_then(Value::as_str)
                .map(String::from)
                .ok_or_else(|| AppError::new("VALIDATION", format!("缺少 {key}")))
        };
        let entry = || {
            serde_json::from_value::<EntryDetail>(
                input.get("entry").cloned().unwrap_or(Value::Null),
            )
            .map_err(AppError::from)
        };
        let encoded = |v| Ok(v);
        match op {
            "get_workspace" => self.timer.db.read(|c| {
                let entries = records::all(c)?;
                let active_entry = entries
                    .iter()
                    .find(|e| e.deleted_at.is_none() && e.status.active())
                    .cloned();
                let timer = TimerState {
                    closed_duration_ms: active_entry.as_ref().map_or(0, |e| e.duration()),
                    active_entry,
                    server_now: self.timer.clock.utc_now(),
                    workspace_revision: crate::db::meta(c, "mutation_revision")?,
                    storage_error: self.timer.storage_error.lock().unwrap().clone(),
                };
                Ok(json!({"timer":timer,"entries":entries,"settings":crate::db::settings(c)?,"lastExportAt":backup::last_export_at(c)?}))
            }),
            "get_timer_state" => Ok(serde_json::to_value(self.timer.state()?)?),
            "start_timer" => Ok(serde_json::to_value(self.timer.start(
                ctx()?,
                text("title")?,
                input.get("note").and_then(Value::as_str).map(String::from),
            )?)?),
            "pause_timer" => Ok(serde_json::to_value(
                self.timer.pause(ctx()?, &text("entryId")?)?,
            )?),
            "resume_timer" => Ok(serde_json::to_value(
                self.timer.resume(ctx()?, &text("entryId")?)?,
            )?),
            "stop_timer" => Ok(serde_json::to_value(
                self.timer.stop(ctx()?, &text("entryId")?)?,
            )?),
            "save_entry" => Ok(serde_json::to_value(self.entries.save(ctx()?, entry()?)?)?),
            "resolve_entry" => Ok(serde_json::to_value(
                self.entries.resolve(
                    ctx()?,
                    entry()?,
                    input
                        .get("continueTimer")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                )?,
            )?),
            "delete_entry" => Ok(serde_json::to_value(
                self.entries.delete(ctx()?, &text("entryId")?)?,
            )?),
            "restore_entry" => Ok(serde_json::to_value(
                self.entries.restore(
                    ctx()?,
                    &text("entryId")?,
                    input
                        .get("asReview")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                )?,
            )?),
            "get_month_report" => self.timer.db.read(|c| {
                Ok(serde_json::to_value(reports::report(
                    &records::all(c)?,
                    &text("month")?,
                    &crate::db::settings(c)?.reporting_time_zone,
                )?)?)
            }),
            "get_week_report" => self.timer.db.read(|c| {
                let settings = crate::db::settings(c)?;
                Ok(serde_json::to_value(reports::week_report(
                    &records::all(c)?,
                    &text("date")?,
                    &settings.reporting_time_zone,
                    settings.week_starts_on,
                )?)?)
            }),
            "parse_local" => Ok(json!(reports::parse_local(
                &text("value")?,
                &text("zone")?,
                input
                    .get("offset")
                    .and_then(Value::as_i64)
                    .map(|o| o as i32)
            )?)),
            "preview_reporting_zone" => Ok(serde_json::to_value(
                self.settings.preview(&text("zone")?)?,
            )?),
            "set_reporting_zone" => Ok(serde_json::to_value(
                self.settings.apply(ctx()?, &text("token")?)?,
            )?),
            "export_backup" => {
                let bytes = self.timer.db.read(|c| {
                    let tx = c.unchecked_transaction()?;
                    let b = backup::capture(&tx)?;
                    let bytes = serde_json::to_vec_pretty(&b)?;
                    tx.commit()?;
                    Ok(bytes)
                })?;
                backup::parse(&bytes, self.timer.clock.utc_now())?;
                let path = PathBuf::from(text("destination")?);
                backup::atomic_write(&path, &bytes)?;
                let exported_at = self.timer.clock.utc_now();
                self.timer.db.internal(|tx|{tx.execute("INSERT INTO device_settings VALUES('last_export',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[exported_at.to_string()])?;Ok(())})?;
                Ok(json!({"path":path,"exportedAt":exported_at}))
            }
            "export_month_csv" => {
                let report = self.timer.db.read(|c| {
                    reports::report(
                        &records::all(c)?,
                        &text("month")?,
                        &crate::db::settings(c)?.reporting_time_zone,
                    )
                })?;
                let path = PathBuf::from(text("destination")?);
                csv::export(&report, &path)?;
                Ok(json!({"path":path}))
            }
            "inspect_backup" => Ok(serde_json::to_value(
                self.restore.inspect(&PathBuf::from(text("source")?))?,
            )?),
            "restore_backup" => Ok(serde_json::to_value(
                self.restore.apply(
                    ctx()?,
                    &text("token")?,
                    input
                        .get("confirmed")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                )?,
            )?),
            "create_local_snapshot" => {
                Ok(serde_json::to_value(self.snapshots.create("automatic")?)?)
            }
            "list_local_snapshots" => Ok(serde_json::to_value(self.snapshots.list()?)?),
            "inspect_local_snapshot" => Ok(serde_json::to_value(
                self.restore.inspect_snapshot(&text("id")?)?,
            )?),
            "delete_local_snapshot" => {
                self.snapshots.delete(&text("id")?)?;
                Ok(Value::Null)
            }
            "cancel_quit" => {
                self.lifecycle.cancel_quit();
                Ok(Value::Null)
            }
            "prepare_quit" => {
                self.lifecycle.quit_pending()?;
                self.allow_exit.store(true, Ordering::SeqCst);
                Ok(Value::Null)
            }
            _ => {
                encoded(Value::Null).and_then(|_| Err(AppError::new("UNKNOWN_COMMAND", "未知操作")))
            }
        }
    }
}
pub fn show(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
#[tauri::command]
pub async fn command(app: tauri::AppHandle, op: String, input: Value) -> Result<Value> {
    if op == "repair_database" {
        if input.get("confirmed").and_then(Value::as_bool) != Some(true) {
            return Err(AppError::new(
                "VALIDATION",
                "请确认保留损坏副本并创建新工作区",
            ));
        }
        return crate::platform::startup::repair(&app);
    }
    let state = app.try_state::<Arc<Controller>>().ok_or_else(|| {
        app.state::<crate::platform::startup::StartupState>()
            .error
            .lock()
            .unwrap()
            .clone()
            .unwrap_or_else(|| AppError::new("STORAGE", "工作区无法打开"))
    })?;
    let is_write = !matches!(
        op.as_str(),
        "get_workspace"
            | "get_timer_state"
            | "get_month_report"
            | "get_week_report"
            | "parse_local"
            | "preview_reporting_zone"
            | "inspect_backup"
            | "inspect_local_snapshot"
            | "list_local_snapshots"
    );
    let controller = state.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || controller.run(&op, input))
        .await
        .map_err(|_| AppError::new("INTERNAL", "操作中断，请重新打开窗口"))?;
    if result.is_ok() && is_write {
        let _ = app.emit("worklog-changed", ());
        crate::platform::tray::refresh(&app);
    }
    if state.allow_exit.load(Ordering::SeqCst) {
        app.exit(0);
    }
    result
}
