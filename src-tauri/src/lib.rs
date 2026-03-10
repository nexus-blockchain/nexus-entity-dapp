#[cfg(debug_assertions)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                let window = _app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            // In production, navigate to / so Next.js client router takes over.
            // The frontend dist (out/) has 404.html as SPA fallback for
            // dynamic [entityId] routes that don't have pre-rendered HTML.
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
