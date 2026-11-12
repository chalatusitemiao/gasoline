#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;

use tauri::{Url, WebviewWindowBuilder, webview::NewWindowResponse};

fn is_local_page(url: &Url) -> bool {
    match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) | ("http", Some("tauri.localhost"), None) => true,
        ("http", Some("localhost"), Some(1420)) => cfg!(dev),
        _ => false,
    }
}

fn main() {
    tauri::Builder::default()
        .manage(api::ApiState::default())
        .invoke_handler(tauri::generate_handler![
            api::set_api_origin,
            api::api_request
        ])
        .setup(|app| {
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(is_local_page)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Gasoline desktop application");
}
