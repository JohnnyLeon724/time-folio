use crate::{
    commands::{show, Controller},
    domain::*,
};
use std::sync::{atomic::Ordering, Arc};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
pub fn install(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开 HourTrail", true, None::<&str>)?;
    let status = MenuItem::with_id(app, "status", "没有活动任务", false, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "暂停", false, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume", "继续", false, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "结束并核对", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 HourTrail", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &status, &pause, &resume, &stop, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("HourTrail")
        .on_menu_event(move |app, event| {
            let controller = app.state::<Arc<Controller>>();
            let action = event.id.as_ref();
            match action {
                "open" => show(app),
                "quit" => match controller.lifecycle.request_quit() {
                    Ok(true) => {
                        show(app);
                        let _ = app.emit("quit-requested", ());
                    }
                    Ok(false) => {
                        controller.allow_exit.store(true, Ordering::SeqCst);
                        app.exit(0);
                    }
                    Err(e) => {
                        show(app);
                        let _ = app.emit("platform-warning", e.message);
                    }
                },
                "pause" | "resume" | "stop" => {
                    let result = (|| {
                        let Some(e) = controller.timer.state()?.active_entry else {
                            return Ok(());
                        };
                        let context = MutationContext {
                            request_id: id(),
                            workspace_revision: controller.timer.db.revision()?,
                            expected_entry_version: Some(e.version),
                        };
                        let result = match action {
                            "pause" => controller.timer.pause(context, &e.id),
                            "resume" => controller.timer.resume(context, &e.id),
                            _ => controller.timer.stop(context, &e.id),
                        }?;
                        if action == "stop" {
                            show(app);
                            let _ = app.emit("review-entry", result.value.id);
                        }
                        Ok::<_, AppError>(())
                    })();
                    if let Err(e) = result {
                        show(app);
                        let _ = app.emit("platform-warning", e.message);
                    }
                    let _ = app.emit("worklog-changed", ());
                    refresh(app);
                }
                _ => {}
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    app.manage(TrayMenu {
        status,
        pause,
        resume,
        stop,
    });
    app.state::<Arc<Controller>>()
        .tray_ready
        .store(true, Ordering::SeqCst);
    refresh(app);
    Ok(())
}
pub struct TrayMenu {
    status: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    resume: MenuItem<tauri::Wry>,
    stop: MenuItem<tauri::Wry>,
}
pub fn refresh(app: &tauri::AppHandle) {
    let Some(menu) = app.try_state::<TrayMenu>() else {
        return;
    };
    let state = app.state::<Arc<Controller>>();
    if let Ok(timer) = state.timer.state() {
        let status = timer.active_entry.as_ref().map(|e| e.status);
        let _ = menu.pause.set_enabled(status == Some(Status::Running));
        let _ = menu.resume.set_enabled(status == Some(Status::Paused));
        let _ = menu.stop.set_enabled(status.is_some());
        let label = timer
            .active_entry
            .as_ref()
            .map(|e| {
                format!(
                    "{}：{}",
                    if e.status == Status::Running {
                        "计时中"
                    } else {
                        "已暂停"
                    },
                    e.title
                )
            })
            .unwrap_or_else(|| "没有活动任务".into());
        let _ = menu.status.set_text(&label);
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some(&label));
        }
    }
}
