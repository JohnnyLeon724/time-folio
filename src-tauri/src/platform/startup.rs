use crate::{commands::Controller, domain::*, services::snapshots::preserve_corrupt};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager};
pub struct StartupState {
    pub directory: PathBuf,
    pub error: Mutex<Option<AppError>>,
    pub repair: Mutex<()>,
}
pub fn start(app: &tauri::AppHandle, controller: Arc<Controller>) {
    app.manage(controller.clone());
    if let Err(e) = super::tray::install(app) {
        eprintln!("Tray unavailable: {e}");
    }
    super::power_events::install(controller.recovery.clone(), app.clone());
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(15));
        let before = controller.timer.db.revision().ok();
        controller.recovery.tick();
        if let Err(e) = controller
            .snapshots
            .automatic(controller.timer.clock.utc_now())
        {
            let _ = handle.emit("platform-warning", e.message);
        }
        if before != controller.timer.db.revision().ok()
            || controller.timer.storage_error.lock().unwrap().is_some()
        {
            let _ = handle.emit("worklog-changed", ());
            super::tray::refresh(&handle);
        }
    });
}
pub fn repair(app: &tauri::AppHandle) -> Result<serde_json::Value> {
    let startup = app.state::<StartupState>();
    let _guard = startup.repair.lock().unwrap();
    if app.try_state::<Arc<Controller>>().is_some() {
        return Err(AppError::new(
            "STATE_CONFLICT",
            "工作区已可用，不需要重新创建",
        ));
    }
    let error = startup
        .error
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| AppError::new("STATE_CONFLICT", "没有需要恢复的数据库"))?;
    if error.code == "UNSUPPORTED_FORMAT" {
        return Err(error);
    }
    let path = startup.directory.join("hourtrail.db");
    let preserved = if path.exists() {
        Some(preserve_corrupt(&path)?)
    } else {
        None
    };
    // Only reached by the explicit recovery-page confirmation; all source files have synced copies first.
    for suffix in ["-wal", "-shm", ""] {
        let p = PathBuf::from(format!("{}{suffix}", path.display()));
        if p.exists() {
            std::fs::remove_file(p)?;
        }
    }
    let controller = Arc::new(Controller::new(startup.directory.clone())?);
    start(app, controller);
    *startup.error.lock().unwrap() = None;
    Ok(serde_json::json!({"preservedAt":preserved}))
}
