// CapeWatch for Windows: a window with the CapeWatch page, a tray icon, notifications and auto-update.
// Closing the window hides it to the tray; the app quits only from the tray menu.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_updater::UpdaterExt;

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = app.emit("window-visible", true);
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

// The opening effect (title effect and sound) plays once per run of CapeWatch: the first time the user sees the
// window. Started by the user: right away. Started with Windows (hidden): the first time the window is opened
// from the tray. Closing with X and opening again does not replay it, and a notification click never plays it.
static GREETED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn open_for_user(app: &AppHandle) {
    show_main(app);
    if !GREETED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        log::info!("window: first opened by the user in this run, greeting");
        let _ = app.emit("greet", ());
    }
}

// How the page starts: "greet" (play the effect now), "wait" (started hidden: keep the title hidden until the
// first open), "none" (opened by a notification click: show the title as is).
struct Greet(Mutex<&'static str>);

#[tauri::command]
fn take_greeting(state: tauri::State<Greet>) -> &'static str {
    state.0.lock().map(|g| *g).unwrap_or("none")
}

// "Delete my data" (Settings, app/shell.js): the log files go too, since they name the players looked up. Only
// CapeWatch's own files in its log folder: the current one is emptied (the logger keeps writing to it), the older
// ones (capewatch_<date>.log) are deleted. Returns how many files were cleared.
#[tauri::command]
fn clear_logs(app: AppHandle) -> Result<u32, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let mut cleared = 0;
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_owned();
        if !path.is_file() || !name.starts_with("capewatch") || !name.ends_with(".log") { continue; }
        if name == "capewatch.log" {
            std::fs::OpenOptions::new().write(true).truncate(true).open(&path).map_err(|e| e.to_string())?;
        } else {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        cleared += 1;
    }
    log::info!("logs: cleared {cleared} files (Delete my data)");
    Ok(cleared)
}

#[cfg(windows)]
mod win32 {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::UI::Notifications::{ToastNotification, ToastNotificationManager};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_MENU,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic, SetForegroundWindow,
        SetWindowPos, ShowWindow, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        SW_RESTORE, SW_SHOW,
    };

    // ---------- notifications ----------
    fn xml_escape(s: &str) -> String {
        s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
    }

    /// Shows a notification whose click opens `launch`. Protocol activation works also when the app is closed:
    /// Windows starts the program registered for the address.
    pub fn toast(app_id: &str, title: &str, body: &str, launch: &str) -> windows::core::Result<()> {
        let xml = format!(
            r#"<toast activationType="protocol" launch="{}"><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
            xml_escape(launch), xml_escape(title), xml_escape(body)
        );
        let doc = XmlDocument::new()?;
        doc.LoadXml(&HSTRING::from(xml))?;
        let toast = ToastNotification::CreateToastNotification(&doc)?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?.Show(&toast)
    }

    // ---------- the capewatch:// address ----------
    fn reg_set(key: &str, name: Option<&str>, value: &str) -> windows::core::Result<()> {
        let data: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
        let name = name.map(HSTRING::from);
        unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                &HSTRING::from(key),
                name.as_ref().map(|n| PCWSTR(n.as_ptr())).unwrap_or(PCWSTR::null()),
                REG_SZ.0,
                Some(data.as_ptr() as *const _),
                (data.len() * 2) as u32,
            )
            .ok()
        }
    }

    /// Registers capewatch:// for this user, pointing at this exe. The installer does the same; doing it at every
    /// start also repairs it if the app was moved.
    pub fn register_scheme() -> windows::core::Result<()> {
        let exe = std::env::current_exe().map_err(|_| windows::core::Error::empty())?;
        let exe = exe.to_string_lossy();
        reg_set(r"Software\Classes\capewatch", None, "URL:CapeWatch")?;
        reg_set(r"Software\Classes\capewatch", Some("URL Protocol"), "")?;
        reg_set(r"Software\Classes\capewatch\DefaultIcon", None, &format!("{exe},0"))?;
        reg_set(r"Software\Classes\capewatch\shell\open\command", None, &format!("\"{exe}\" \"%1\""))
    }

    // ---------- bringing the window to the front ----------
    // Windows lets a program take the foreground only in some cases. These are the usual ways around it.
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

// A click on a CapeWatch notification opens capewatch://cape/<id>. Windows starts CapeWatch with that address
// when it is closed; when it is running, the new start hands the address to the running app (single instance).
const SCHEME: &str = "capewatch://cape/";

fn cape_from_args(args: &[String]) -> Option<String> {
    args.iter()
        .find_map(|a| a.strip_prefix(SCHEME))
        .map(|id| id.trim_end_matches('/').to_string())
        .filter(|id| !id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
}

// The cape asked for at a cold start. The page takes it once its data is on screen.
struct Pending(Mutex<Option<String>>);

#[tauri::command]
fn take_pending_cape(state: tauri::State<Pending>) -> Option<String> {
    state.0.lock().ok().and_then(|mut p| p.take())
}

// A Windows notification about one cape; clicking it opens CapeWatch on that cape, also when CapeWatch is closed.
#[tauri::command]
fn notify_cape(app: AppHandle, title: String, body: String, cape_id: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        let launch = format!("{SCHEME}{cape_id}");
        win32::toast(&app.config().identifier, &title, &body, &launch).map_err(|e| e.to_string())?;
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second start: the user opened CapeWatch again, or clicked a notification (capewatch://cape/<id>).
            if let Some(id) = cape_from_args(&args) {
                log::info!("notification click (app running): {id}");
                GREETED.store(true, std::sync::atomic::Ordering::SeqCst);   // the window has been seen
                show_main(app);
                let _ = app.emit("open-cape", id);
            } else {
                open_for_user(app);
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .level(log::LevelFilter::Info)
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: Some("capewatch".into()) }))
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout))
                // The log never grows past about 3 MB: at 1 MB the file is renamed with the date and a new one starts,
                // and only the 2 newest old files are kept (older ones are deleted). Before, the whole log was deleted
                // at 2 MB, so after a busy day nothing older than a few hours was left.
                .max_file_size(1_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(2))
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
            let args: Vec<String> = std::env::args().collect();
            let minimized = args.iter().any(|a| a == "--minimized");
            log::info!("CapeWatch {} starting (minimized: {minimized})", app.package_info().version);
            let pending = cape_from_args(&args);
            if let Some(id) = &pending { log::info!("notification click (app was closed): {id}"); }
            // Diagnostics: `capewatch.exe --test-notification=<cape id>` shows a sample notification for that cape.
            #[cfg(windows)]
            if let Some(id) = args.iter().find_map(|a| a.strip_prefix("--test-notification=")) {
                let launch = format!("{SCHEME}{id}");
                match win32::toast(&app.config().identifier, "CapeWatch", "Test notification. Click it to open the cape.", &launch) {
                    Ok(()) => log::info!("test notification shown: {launch}"),
                    Err(e) => log::error!("test notification failed: {e}"),
                }
            }
            app.manage(Pending(Mutex::new(pending)));
            #[cfg(windows)]
            match win32::register_scheme() {
                Ok(()) => log::info!("capewatch:// registered"),
                Err(e) => log::warn!("capewatch:// not registered: {e}"),
            }

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
                    "open" => open_for_user(app),
                    "check" => { let _ = app.emit("check-now", ()); }
                    "settings" => { open_for_user(app); let _ = app.emit("open-settings", ()); }
                    "quit" => { log::info!("quit from tray"); app.exit(0); }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        open_for_user(tray.app_handle());
                    }
                })
                .build(app)?;

            // Started with Windows (--minimized): nothing but the tray icon, no window, no glow, no sound.
            // A notification click always shows the window (on its cape, without the greeting).
            let from_click = app.state::<Pending>().0.lock().map(|p| p.is_some()).unwrap_or(false);
            let mode = if from_click { "none" } else if minimized { "wait" } else { "greet" };
            if mode != "wait" { GREETED.store(true, std::sync::atomic::Ordering::SeqCst); }
            log::info!("opening effect: {mode}");
            app.manage(Greet(Mutex::new(mode)));
            if minimized && !from_click {
                log::info!("window: stays hidden (started with Windows), tray icon only");
            } else {
                show_main(app.handle());
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move { check_update(handle).await });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![notify_cape, take_pending_cape, take_greeting, clear_logs])
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("window-visible", false);   // hidden in the tray: the page stops drawing
                }
                // minimizing and restoring both come as a resize
                WindowEvent::Resized(_) => {
                    let seen = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
                    let _ = window.emit("window-visible", seen);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CapeWatch");
}
