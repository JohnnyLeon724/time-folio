use crate::services::recovery::RecoveryService;
use std::sync::Arc;
use tauri::Emitter;
fn notify(recovery: &RecoveryService, app: &tauri::AppHandle, sleep: bool) {
    let result = if sleep {
        recovery.suspend()
    } else {
        recovery.resume()
    };
    if let Err(e) = result {
        *recovery.timer.storage_error.lock().unwrap() = Some(e.message);
    }
    let _ = app.emit("worklog-changed", ());
}
#[cfg(target_os = "macos")]
pub fn install(recovery: Arc<RecoveryService>, app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use std::ffi::c_void;
        #[link(name = "IOKit", kind = "framework")]
        extern "C" {
            fn IORegisterForSystemPower(
                refcon: *mut c_void,
                port: *mut *mut c_void,
                callback: extern "C" fn(*mut c_void, u32, u32, *mut c_void),
                notifier: *mut u32,
            ) -> u32;
            fn IOAllowPowerChange(port: u32, id: isize) -> i32;
            fn IONotificationPortGetRunLoopSource(port: *mut c_void) -> *const c_void;
        }
        #[link(name = "CoreFoundation", kind = "framework")]
        extern "C" {
            fn CFRunLoopGetCurrent() -> *const c_void;
            fn CFRunLoopAddSource(
                run_loop: *const c_void,
                source: *const c_void,
                mode: *const c_void,
            );
            fn CFRunLoopRun();
            static kCFRunLoopDefaultMode: *const c_void;
        }
        struct Context {
            recovery: Arc<RecoveryService>,
            app: tauri::AppHandle,
            port: u32,
        }
        extern "C" fn callback(raw: *mut c_void, _service: u32, message: u32, arg: *mut c_void) {
            // IOKit owns callback scheduling on this thread; the boxed context lives for the run loop.
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| unsafe {
                let c = &*(raw as *const Context);
                match message {
                    0xe0000280 => {
                        notify(&c.recovery, &c.app, true);
                        IOAllowPowerChange(c.port, arg as isize);
                    }
                    0xe0000300 => notify(&c.recovery, &c.app, false),
                    0xe0000270 => {
                        IOAllowPowerChange(c.port, arg as isize);
                    }
                    _ => {}
                }
            }));
        }
        let mut context = Box::new(Context {
            recovery,
            app,
            port: 0,
        });
        let mut notification_port = std::ptr::null_mut();
        let mut notifier = 0;
        unsafe {
            let port = IORegisterForSystemPower(
                (&mut *context as *mut Context).cast(),
                &mut notification_port,
                callback,
                &mut notifier,
            );
            if port == 0 || notification_port.is_null() {
                let _ = context.app.emit(
                    "platform-warning",
                    "无法监听系统电源事件，将使用运行中断核对。 ",
                );
                return;
            }
            context.port = port;
            let source = IONotificationPortGetRunLoopSource(notification_port);
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopDefaultMode);
            CFRunLoopRun();
        }
    });
}
#[cfg(target_os = "windows")]
pub fn install(recovery: Arc<RecoveryService>, app: tauri::AppHandle) {
    std::thread::spawn(move || unsafe {
        use windows_sys::Win32::{
            Foundation::*, System::LibraryLoader::GetModuleHandleW, UI::WindowsAndMessaging::*,
        };
        static CONTEXT: std::sync::OnceLock<(Arc<RecoveryService>, tauri::AppHandle)> =
            std::sync::OnceLock::new();
        unsafe extern "system" fn proc(hwnd: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
            if msg == WM_POWERBROADCAST {
                if let Some((r, a)) = CONTEXT.get() {
                    match w {
                        4 => notify(r, a, true),
                        18 => notify(r, a, false),
                        _ => {}
                    }
                }
                return 1;
            }
            DefWindowProcW(hwnd, msg, w, l)
        }
        let _ = CONTEXT.set((recovery, app.clone()));
        let class: Vec<u16> = "HourTrailPower\0".encode_utf16().collect();
        let instance = GetModuleHandleW(std::ptr::null());
        let wc = WNDCLASSW {
            lpfnWndProc: Some(proc),
            hInstance: instance,
            lpszClassName: class.as_ptr(),
            ..std::mem::zeroed()
        };
        RegisterClassW(&wc);
        let window = CreateWindowExW(
            0,
            class.as_ptr(),
            class.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if window.is_null() {
            let _ = app.emit(
                "platform-warning",
                "无法监听系统电源事件，将使用运行中断核对。",
            );
            return;
        }
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn install(_recovery: Arc<RecoveryService>, _app: tauri::AppHandle) {}
