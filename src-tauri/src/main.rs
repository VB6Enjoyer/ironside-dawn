// The desktop app is a window around the web build: the simulation, its
// worker and the saves (IndexedDB) all live in the webview, as in a browser.

// No console window alongside the app in Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{webview::DownloadEvent, Manager, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // The window is made here rather than from the config alone, so
            // that exported saves go to the Downloads folder (left alone,
            // some systems save them wherever the app was started from).
            let config = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .expect("tauri.conf.json describes the main window");
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                .on_download(|webview, event| {
                    if let DownloadEvent::Requested { destination, .. } = event {
                        let path = webview.path();
                        // Not every Linux desktop names its Downloads folder.
                        let dir = path.download_dir().ok().or_else(|| {
                            let home = path.home_dir().ok()?;
                            let downloads = home.join("Downloads");
                            Some(if downloads.is_dir() { downloads } else { home })
                        });
                        let name = destination.file_name().map(|n| n.to_owned());
                        if let (Some(dir), Some(name)) = (dir, name) {
                            *destination = dir.join(name);
                        }
                    }
                    true
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Ironside Dawn");
}
