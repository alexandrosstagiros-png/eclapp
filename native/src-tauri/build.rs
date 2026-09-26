fn main() {
    // NDK r27 and older default to 4 KiB. Keep the shared library loadable on
    // Android devices using 16 KiB memory pages as well as existing devices.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("android") {
        println!("cargo:rustc-link-arg-cdylib=-Wl,-z,max-page-size=16384");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_runtime",
            "get_config",
            "set_server",
            "api_request",
            "save_download",
            "open_external",
            "get_update_status",
            "check_for_updates",
            "install_update",
        ]),
    ))
    .expect("Не удалось подготовить приложение ЕЦЛ")
}
