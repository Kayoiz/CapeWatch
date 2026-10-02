// CapeWatch for Windows: a window with the CapeWatch page, a tray icon, notifications and auto-update.
// Closing the window hides it to the tray; the app quits only from the tray menu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_updater::UpdaterExt;

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        // Queued after show/unminimize, so the window is visible by the time it is pulled to the front.
        let win = w.clone();
        let _ = app.run_on_main_thread(move || {
            #[cfg(windows)]
            if let Ok(h) = win.hwnd() {
                let front = unsafe { win32::bring_to_front(h.0 as isize) };
                log::info!("window: brought to front: {front}");
            }
            let _ = win.set_focus();
        });
    }
}

// Windows lets a program take the foreground only in some cases (for example not right after a click on
// its notification, which belongs to the shell). These are the usual, documented-in-practice ways around it.
#[cfg(windows)]
mod win32 {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_MENU,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, SetForegroundWindow,
        SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        SW_RESTORE, SW_SHOW,
    };

    fn alt_tap() {
        let key = |flags| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_MENU, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        };
        let inputs = [key(Default::default()), key(KEYEVENTF_KEYUP)];
        unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    }

    /// Shows, restores and activates the window above all others. Returns true when it is the foreground window.
    pub unsafe fn bring_to_front(raw: isize) -> bool {
        let hwnd = HWND(raw as *mut _);
        let _ = ShowWindow(hwnd, if IsIconic(hwnd).as_bool() { SW_RESTORE } else { SW_SHOW });
        // 1) share input state with the current foreground window's thread, then activate
        let fg = GetForegroundWindow();
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let me = GetCurrentThreadId();
        let attached = fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, true).as_bool();
        let _ = BringWindowToTop(hwnd);
        let mut ok = SetForegroundWindow(hwnd).as_bool();
        if attached { let _ = AttachThreadInput(me, fg_thread, false); }
        // 2) if Windows still said no: a synthetic Alt tap counts as input for this program, then try again
        if !ok || GetForegroundWindow() != hwnd {
            alt_tap();
            ok = SetForegroundWindow(hwnd).as_bool();
        }
        // 3) in every case put it on top of the other windows (topmost on, then off again)
        let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW;
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, flags);
        let _ = SetWindowPos(hwnd, Some(HWND_NOTOPMOST), 0, 0, 0, 0, flags);
        ok && GetForegroundWindow() == hwnd
    }
}

// A Windows notification about one cape. Clicking it opens the window on that cape's details.
// (The notification plugin on Windows does not report clicks, so the app sends this one itself.)
#[tauri::command]
fn notify_cape(app: AppHandle, title: String, body: String, cape_id: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::Toast;
        let handle = app.clone();
        let id = cape_id.clone();
        Toast::new(&app.config().identifier)
            .title(&title)
            .text1(&body)
            .on_activated(move |_| {
                log::info!("notification clicked: {id}");
                show_main(&handle);
                let _ = handle.emit("open-cape", id.clone());
                Ok(())
            })
            .show()
            .map_err(|e| e.to_string())?;
        log::info!("notification shown: {cape_id}");
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, title, body, cape_id);
        Err("not supported".into())
    }
}

async fn check_update(app: AppHandle) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => { log::warn!("updater: not available: {e}"); return; }
    };
    match updater.check().await {
        Ok(Some(update)) => {
            log::info!("updater: version {} found, installing", update.version);
            match update.download_and_install(|_, _| {}, || {}).await {
                Ok(()) => { log::info!("updater: installed, restarting"); app.restart(); }
                Err(e) => log::error!("updater: install failed: {e}"),
            }
        }
        Ok(None) => log::info!("updater: up to date"),
        Err(e) => log::warn!("updater: check failed: {e}"),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Also how Windows opens the app when a notification is clicked later in the notification centre.
            show_main(app);
            let _ = app.emit("second-start", ());
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("capewatch".into()) }))
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout))
                .max_file_size(2_000_000)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let minimized = std::env::args().any(|a| a == "--minimized");
            log::info!("CapeWatch {} starting (minimized: {minimized})", app.package_info().version);

            let open = MenuItem::with_id(app, "open", "Open CapeWatch", true, None::<&str>)?;
            let check = MenuItem::with_id(app, "check", "Check now", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &check, &settings, &sep, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("CapeWatch")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "check" => { let _ = app.emit("check-now", ()); }
                    "settings" => { show_main(app); let _ = app.emit("open-settings", ()); }
                    "quit" => { log::info!("quit from tray"); app.exit(0); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            if !minimized { show_main(app.handle()); }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move { check_update(handle).await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![notify_cape])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CapeWatch");
}
