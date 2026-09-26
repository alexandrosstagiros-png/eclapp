use std::io::Write;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use ecl_native_core::{ApiRequest, ApiResponse, Engine, NativeConfig};
use serde::Serialize;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use tauri_plugin_opener::OpenerExt;

mod updates;

const MAX_DOWNLOAD_BYTES: usize = 40 * 1024 * 1024;

#[derive(Serialize)]
struct RuntimeInfo {
    platform: &'static str,
    version: &'static str,
    #[serde(rename = "configWarning")]
    config_warning: Option<&'static str>,
}

struct StartupNotice(Option<&'static str>);

#[tauri::command]
fn get_runtime(notice: State<'_, StartupNotice>) -> RuntimeInfo {
    RuntimeInfo {
        platform: std::env::consts::OS,
        version: env!("CARGO_PKG_VERSION"),
        config_warning: notice.0,
    }
}

#[tauri::command]
fn get_config(engine: State<'_, Engine>) -> Result<Option<NativeConfig>, String> {
    engine.config()
}

#[tauri::command]
async fn set_server(server_url: String, engine: State<'_, Engine>) -> Result<NativeConfig, String> {
    engine.configure(server_url).await
}

#[tauri::command]
async fn api_request(
    request: ApiRequest,
    engine: State<'_, Engine>,
) -> Result<ApiResponse, String> {
    engine.request(request).await
}

// A suggested filename is never a filesystem path. Only the system picker can
// grant a destination; the WebView cannot write arbitrary paths.
fn safe_filename(filename: &str) -> String {
    let cleaned: String = filename
        .chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
        })
        .take(160)
        .collect();
    let cleaned = cleaned.trim_matches([' ', '.']);
    if cleaned.is_empty() {
        "document".into()
    } else {
        cleaned.into()
    }
}

fn external_url(input: &str) -> Result<url::Url, String> {
    if input.len() > 8192 || input.chars().any(char::is_control) {
        return Err("Некорректная ссылка.".into());
    }
    let url = url::Url::parse(input).map_err(|_| "Некорректная ссылка.")?;
    if !matches!(url.scheme(), "https" | "http" | "mailto" | "tel")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Этот тип ссылки не поддерживается.".into());
    }
    Ok(url)
}

#[tauri::command]
async fn open_external(url: String, app: tauri::AppHandle) -> Result<(), String> {
    let url = external_url(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|_| "Не удалось открыть ссылку в другом приложении.".into())
}

#[tauri::command]
async fn save_download(
    filename: String,
    body_base64: String,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    if body_base64.len() > MAX_DOWNLOAD_BYTES.div_ceil(3) * 4 {
        return Err("Файл больше 40 МБ.".into());
    }
    let bytes = STANDARD
        .decode(body_base64)
        .map_err(|_| "Некорректное содержимое файла.")?;
    if bytes.len() > MAX_DOWNLOAD_BYTES {
        return Err("Файл больше 40 МБ.".into());
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Сохранить документ ЕЦЛ")
        .set_file_name(safe_filename(&filename))
        .save_file(move |path| {
            let _ = tx.send(path);
        });
    let Some(path) = rx
        .await
        .map_err(|_| "Не удалось открыть окно сохранения.")?
    else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || {
        let options = serde_json::from_value(serde_json::json!({
            "read": false, "write": true, "create": true, "truncate": true, "mode": 384
        }))
        .map_err(|_| "Не удалось подготовить сохранение.")?;
        let saved = (|| {
            let mut file = app
                .fs()
                .open(path.clone(), options)
                .map_err(|_| "Не удалось открыть выбранный файл.")?;
            file.write_all(&bytes)
                .and_then(|_| file.sync_all())
                .map_err(|_| "Не удалось записать файл. Проверьте свободное место.")?;
            Ok(true)
        })();
        #[cfg(target_os = "ios")]
        let _ = app.fs().stop_accessing_security_scoped_resource(path);
        saved
    })
    .await
    .map_err(|_| "Сохранение файла прервано.".to_string())?
}

fn local_navigation(url: &url::Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (matches!(url.scheme(), "http" | "https") && url.host_str() == Some("tauri.localhost"))
        || url.as_str() == "about:blank"
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(updates::plugin())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            app.manage(updates::UpdateService::new(app.handle()));
            let directory = app.path().app_config_dir()?;
            let (engine, warning) = match Engine::new(directory.clone()) {
                Ok(engine) => (engine, None),
                Err(_) => (
                    Engine::unconfigured(directory),
                    Some("Не удалось прочитать настройку подключения. Укажите сервер заново."),
                ),
            };
            app.manage(engine);
            app.manage(StartupNotice(warning));
            let dev_origin = app.config().build.dev_url.as_ref().map(url::Url::origin);
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(move |url| {
                    local_navigation(url)
                        || (cfg!(debug_assertions)
                            && dev_origin
                                .as_ref()
                                .is_some_and(|origin| *origin == url.origin()))
                })
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime,
            get_config,
            set_server,
            api_request,
            save_download,
            open_external,
            updates::get_update_status,
            updates::check_for_updates,
            updates::install_update
        ])
        .run(tauri::generate_context!())
        .expect("Не удалось запустить ЕЦЛ");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_suggestions_cannot_supply_paths() {
        assert_eq!(safe_filename("../../рейс:12.pdf"), "рейс12.pdf");
        assert_eq!(safe_filename(" ... "), "document");
        assert_eq!(safe_filename("отчёт.xlsx"), "отчёт.xlsx");
    }

    #[test]
    fn external_links_cannot_launch_executables_or_embed_credentials() {
        for value in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "shell:AppsFolder",
            "https://user:secret@example.com",
        ] {
            assert!(external_url(value).is_err());
        }
        assert!(external_url("https://example.com/docs").is_ok());
        assert!(external_url("tel:+79990000001").is_ok());
    }

    #[test]
    fn navigation_is_confined_to_packaged_ui() {
        assert!(local_navigation(
            &url::Url::parse("tauri://localhost/index.html").unwrap()
        ));
        assert!(local_navigation(
            &url::Url::parse("http://tauri.localhost/").unwrap()
        ));
        assert!(!local_navigation(
            &url::Url::parse("https://example.com/").unwrap()
        ));
    }
}
