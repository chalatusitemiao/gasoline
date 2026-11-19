fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "set_api_origin",
            "api_request",
            "check_for_update",
            "install_update",
        ]),
    ))
    .expect("failed to configure the Gasoline desktop application");
}
