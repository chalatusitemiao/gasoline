fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["set_api_origin", "api_request"]),
    ))
    .expect("failed to configure the Gasoline desktop application");
}
