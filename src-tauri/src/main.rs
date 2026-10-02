#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::sync::{atomic::Ordering, Arc};
use tauri::{Emitter, Manager};
use timefolio::{
    commands::{self, Controller},
    platform,
};
fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            commands::show(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = std::env::var_os("TIMEFOLIO_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_local_data_dir()?);
            let result = Controller::new(directory.clone());
            app.manage(platform::startup::StartupState {
                directory,
                error: std::sync::Mutex::new(result.as_ref().err().cloned()),
                repair: std::sync::Mutex::new(()),
            });
            if let Ok(controller) = result {
                platform::startup::start(app.handle(), Arc::new(controller));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::command])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let Some(controller) = window.try_state::<Arc<Controller>>() else {
                    return;
                };
                if !controller.allow_exit.load(Ordering::SeqCst) {
                    api.prevent_close();
                    if controller.tray_ready.load(Ordering::SeqCst) {
                        let _ = window.hide();
                    } else {
                        let _ = window.emit("platform-warning", "托盘不可用，窗口将保持打开。");
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Timefolio startup failed; keep existing database and inspect the error");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let Some(controller) = app.try_state::<Arc<Controller>>() else {
                return;
            };
            if !controller.allow_exit.load(Ordering::SeqCst) {
                match controller.lifecycle.request_quit() {
                    Ok(false) => {}
                    _ => {
                        api.prevent_exit();
                        commands::show(app);
                        let _ = app.emit("quit-requested", ());
                    }
                }
            }
        }
    });
}
