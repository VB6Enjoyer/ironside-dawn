// The desktop app is a window around the web build: the simulation, its
// worker and the saves (IndexedDB) all live in the webview, as in a browser.

// No console window alongside the app in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Ironside Dawn");
}
