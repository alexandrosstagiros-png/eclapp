//! Update transport is separate from the company API: no session headers/cookies
//! are sent to GitHub, and only compiled-in release locations can be used.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::State;

#[cfg(mobile)]
const MAX_MANIFEST: usize = 1024 * 1024;
const MAX_PACKAGE: usize = 256 * 1024 * 1024;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Channel {
    repository: String,
    #[cfg_attr(desktop, allow(dead_code))]
    android_distribution: String,
    ios_url: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    state: &'static str,
    current_version: String,
    platform: &'static str,
    action: &'static str,
    version: Option<String>,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    message: String,
    checked: bool,
}

enum Pending {
    #[cfg(desktop)]
    Desktop(tauri_plugin_updater::Update, Vec<u8>),
    #[cfg(target_os = "android")]
    Android {
        path: std::path::PathBuf,
        signature: String,
        version: String,
    },
    #[cfg(mobile)]
    External(String),
}

struct Inner {
    status: UpdateStatus,
    pending: Option<Pending>,
}

#[derive(Clone)]
pub struct UpdateService {
    inner: Arc<Mutex<Inner>>,
    channel: Option<Channel>,
}

impl UpdateService {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let channel = serde_json::from_str::<Channel>(include_str!("../../update-channel.json"))
            .ok()
            .filter(|c| valid_repository(&c.repository));
        let disabled = channel.is_none()
            || (cfg!(target_os = "ios")
                && channel
                    .as_ref()
                    .and_then(|c| c.ios_url.as_deref())
                    .is_none());
        Self {
            channel,
            inner: Arc::new(Mutex::new(Inner {
                status: UpdateStatus {
                    state: if disabled { "disabled" } else { "idle" },
                    current_version: app.package_info().version.to_string(),
                    platform: std::env::consts::OS,
                    action: if cfg!(target_os = "android") {
                        "installer"
                    } else if cfg!(target_os = "ios") {
                        "external"
                    } else {
                        "restart"
                    },
                    version: None,
                    downloaded_bytes: 0,
                    total_bytes: None,
                    checked: false,
                    message: if disabled {
                        "Канал обновлений ещё не настроен."
                    } else {
                        "Обновления проверяются автоматически."
                    }
                    .into(),
                },
                pending: None,
            })),
        }
    }

    fn snapshot(&self) -> UpdateStatus {
        self.inner.lock().unwrap().status.clone()
    }
    fn status(&self, state: &'static str, message: &str) {
        let mut inner = self.inner.lock().unwrap();
        inner.status.state = state;
        inner.status.message = message.into();
    }
    fn progress(&self, bytes: usize, total: Option<u64>) {
        let mut inner = self.inner.lock().unwrap();
        inner.status.downloaded_bytes += bytes as u64;
        inner.status.total_bytes = total;
    }
    fn ready(&self, pending: Pending, external: bool) {
        let mut inner = self.inner.lock().unwrap();
        inner.pending = Some(pending);
        inner.status.state = if external { "external" } else { "ready" };
        inner.status.checked = true;
        inner.status.message = if external {
            "Доступна новая версия приложения."
        } else {
            "Обновление загружено и проверено. Установите его, когда закончите работу."
        }
        .into();
    }

    fn discard(&self, message: &str) -> UpdateStatus {
        let mut inner = self.inner.lock().unwrap();
        inner.pending = None;
        inner.status.state = "error";
        inner.status.message = message.into();
        inner.status.version = None;
        inner.status.clone()
    }
}

#[cfg(target_os = "android")]
struct AndroidInstaller(tauri::plugin::PluginHandle<tauri::Wry>);

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("ecl-updates")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(AndroidInstaller(_api.register_android_plugin(
                "ru.ecl.workspace.updates",
                "UpdatesPlugin",
            )?));
            Ok(())
        })
        .build()
}

#[tauri::command]
pub fn get_update_status(service: State<'_, UpdateService>) -> UpdateStatus {
    service.snapshot()
}

#[tauri::command]
pub fn check_for_updates(app: tauri::AppHandle, service: State<'_, UpdateService>) -> UpdateStatus {
    {
        let mut inner = service.inner.lock().unwrap();
        // Single flight, and never discard a verified package while the user works.
        if matches!(
            inner.status.state,
            "disabled" | "checking" | "downloading" | "ready" | "installing" | "external"
        ) {
            return inner.status.clone();
        }
        inner.status.state = "checking";
        inner.status.message = "Проверяем обновления…".into();
        inner.status.downloaded_bytes = 0;
        inner.status.total_bytes = None;
    }
    let service = service.inner().clone();
    let initial = service.snapshot();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = check_and_download(&app, &service).await {
            service.status("error", &error);
        }
    });
    initial
}

fn valid_repository(value: &str) -> bool {
    let parts: Vec<_> = value.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && *part != "."
                && *part != ".."
                && part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
        })
}

fn release_url(value: &str, repository: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value).map_err(|_| "Некорректный адрес обновления.")?;
    if !valid_repository(repository)
        || url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !url
            .path()
            .starts_with(&format!("/{repository}/releases/download/"))
        || url.path().contains('%')
        || url.path().split('/').count() != 7
    {
        return Err("Обновление должно находиться в GitHub Releases ЕЦЛ.".into());
    }
    Ok(url)
}

fn newer(version: &str, current: &str) -> Result<bool, String> {
    let next = Version::parse(version.trim_start_matches('v'))
        .map_err(|_| "Некорректная версия обновления.")?;
    let current = Version::parse(current).map_err(|_| "Некорректная версия приложения.")?;
    Ok(next.pre.is_empty() && next > current)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(concat!("ECL/", env!("CARGO_PKG_VERSION"), " updater"))
        .build()
        .map_err(|_| "Не удалось проверить обновления.".to_string())
}

async fn download(
    url: url::Url,
    limit: usize,
    service: Option<&UpdateService>,
) -> Result<Vec<u8>, String> {
    let mut response = client()?
        .get(url)
        .send()
        .await
        .map_err(|_| "Нет связи с сервером обновлений. Проверим позже.")?;
    if response.status().as_u16() == 404 {
        return Err("Обновления ещё не опубликованы или репозиторий недоступен.".into());
    }
    if !response.status().is_success() {
        return Err("Сервер обновлений временно недоступен. Проверим позже.".into());
    }
    let total = response.content_length();
    if total.is_some_and(|n| n > limit as u64) {
        return Err("Файл обновления слишком большой.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Загрузка обновления прервалась. Повторите позже.")?
    {
        if bytes.len().saturating_add(chunk.len()) > limit {
            return Err("Файл обновления слишком большой.".into());
        }
        if let Some(service) = service {
            service.progress(chunk.len(), total);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

fn verify_package(
    bytes: &[u8],
    signature: &str,
    public_key: &str,
    version: &str,
) -> Result<(), String> {
    let decode = |s: &str| {
        STANDARD
            .decode(s.trim())
            .ok()
            .and_then(|b| String::from_utf8(b).ok())
    };
    let public = decode(public_key).and_then(|s| minisign_verify::PublicKey::decode(&s).ok());
    let signature = decode(signature).and_then(|s| minisign_verify::Signature::decode(&s).ok());
    let (Some(public), Some(signature)) = (public, signature) else {
        return Err("Некорректная подпись обновления.".into());
    };
    public
        .verify(bytes, &signature, false)
        .map_err(|_| "Подпись обновления не прошла проверку. Установка отменена.")?;
    let signed_version = signature
        .trusted_comment()
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"));
    let same = signed_version
        .and_then(|v| Version::parse(v.trim_start_matches('v')).ok())
        .zip(Version::parse(version.trim_start_matches('v')).ok())
        .is_some_and(|(a, b)| a == b);
    if !same {
        return Err("Подпись относится к другой версии. Установка отменена.".into());
    }
    Ok(())
}

fn public_key(app: &tauri::AppHandle) -> Result<&str, String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|p| p.get("pubkey"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Не задан ключ проверки обновлений.".into())
}

async fn check_and_download(app: &tauri::AppHandle, service: &UpdateService) -> Result<(), String> {
    let channel = service
        .channel
        .as_ref()
        .ok_or("Канал обновлений не настроен.")?;
    #[cfg(mobile)]
    let endpoint = url::Url::parse(&format!(
        "https://github.com/{}/releases/latest/download/latest.json",
        channel.repository
    ))
    .map_err(|_| "Некорректный канал обновлений.")?;
    // The mobile parser bounds its own metadata; desktop uses the maintained
    // Tauri parser. Packages on every platform use our bounded downloader.
    #[cfg(mobile)]
    let manifest: serde_json::Value =
        serde_json::from_slice(&download(endpoint, MAX_MANIFEST, None).await?)
            .map_err(|_| "Сервер вернул некорректное описание обновления.")?;
    let current = service.snapshot().current_version;

    #[cfg(desktop)]
    {
        use tauri_plugin_updater::UpdaterExt;
        // Tauri parses its own manifest as well, keeping native installer behavior
        // and supported platform selection with the maintained upstream plugin.
        let updater = app
            .updater_builder()
            .timeout(Duration::from_secs(30))
            .configure_client(|builder| builder.https_only(true))
            .build()
            .map_err(|_| "Не удалось подготовить обновление.")?;
        let update = updater.check().await.map_err(|error| match error {
            tauri_plugin_updater::Error::ReleaseNotFound => {
                "Обновления ещё не опубликованы или репозиторий недоступен."
            }
            _ => "Не удалось проверить обновления. Проверьте подключение и повторите позже.",
        })?;
        if let Some(update) = update {
            if !newer(&update.version, &current)? {
                return Err("Версия обновления не новее установленной.".into());
            }
            release_url(update.download_url.as_str(), &channel.repository)?;
            service.inner.lock().unwrap().status.version = Some(update.version.clone());
            service.status("downloading", "Загружаем обновление в фоне…");
            // Use the bounded downloader; verification is identical to the plugin,
            // including its signed version, and is repeated just before install.
            let bytes = download(update.download_url.clone(), MAX_PACKAGE, Some(service)).await?;
            verify_package(&bytes, &update.signature, public_key(app)?, &update.version)?;
            service.ready(Pending::Desktop(update, bytes), false);
            return Ok(());
        }
    }

    #[cfg(mobile)]
    {
        let name = if cfg!(target_os = "android") {
            "android"
        } else {
            "ios"
        };
        if let Some(entry) = manifest.get("mobile").and_then(|m| m.get(name)) {
            let version = entry
                .get("version")
                .and_then(|v| v.as_str())
                .ok_or("Не указана версия мобильного обновления.")?;
            if newer(version, &current)? {
                let url = entry
                    .get("url")
                    .and_then(|v| v.as_str())
                    .ok_or("Не указан адрес обновления.")?;
                service.inner.lock().unwrap().status.version = Some(version.into());
                #[cfg(target_os = "android")]
                if channel.android_distribution == "github" {
                    let url = release_url(url, &channel.repository)?;
                    if !url.path().ends_with(".apk") {
                        return Err("Ожидается APK-файл обновления.".into());
                    }
                    let signature = entry
                        .get("signature")
                        .and_then(|v| v.as_str())
                        .ok_or("У обновления отсутствует подпись.")?;
                    service.status("downloading", "Загружаем обновление в фоне…");
                    let bytes = download(url, MAX_PACKAGE, Some(service)).await?;
                    verify_package(&bytes, signature, public_key(app)?, version)?;
                    let directory = app
                        .path()
                        .app_cache_dir()
                        .map_err(|_| "Не удалось открыть кэш обновлений.")?
                        .join("updates");
                    std::fs::create_dir_all(&directory)
                        .map_err(|_| "Не удалось создать кэш обновления.")?;
                    let path = directory.join("ECL-update.apk");
                    let temporary = directory.join("ECL-update.tmp");
                    std::fs::write(&temporary, bytes).map_err(|_| {
                        "Не удалось сохранить обновление. Проверьте свободное место."
                    })?;
                    std::fs::rename(temporary, &path)
                        .map_err(|_| "Не удалось сохранить обновление.")?;
                    service.ready(
                        Pending::Android {
                            path,
                            signature: signature.into(),
                            version: version.into(),
                        },
                        false,
                    );
                    return Ok(());
                }
                let allowed = if cfg!(target_os = "ios") {
                    channel.ios_url.as_deref() == Some(url) && store_url(url, true)
                } else {
                    store_url(url, false)
                };
                if !allowed {
                    return Err(
                        "Адрес магазина обновлений не настроен или не поддерживается.".into(),
                    );
                }
                service.inner.lock().unwrap().status.action = "external";
                service.ready(Pending::External(url.into()), true);
                return Ok(());
            }
        } else {
            return Err("Обновления для этой платформы ещё не опубликованы.".into());
        }
    }
    let mut inner = service.inner.lock().unwrap();
    inner.status.state = "idle";
    inner.status.checked = true;
    inner.status.message = "Установлена последняя опубликованная версия.".into();
    Ok(())
}

#[cfg(any(mobile, test))]
fn store_url(value: &str, ios: bool) -> bool {
    url::Url::parse(value).is_ok_and(|u| {
        u.scheme() == "https"
            && u.username().is_empty()
            && u.password().is_none()
            && if ios {
                matches!(
                    u.host_str(),
                    Some("apps.apple.com" | "testflight.apple.com")
                )
            } else {
                u.host_str() == Some("play.google.com")
                    && u.path() == "/store/apps/details"
                    && u.query_pairs()
                        .filter(|(key, _)| key == "id")
                        .collect::<Vec<_>>()
                        == vec![("id".into(), "ru.ecl.workspace".into())]
            }
    })
}

#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    service: State<'_, UpdateService>,
) -> Result<UpdateStatus, String> {
    let key = public_key(&app).map(str::to_owned);
    let pending = {
        let mut inner = service.inner.lock().unwrap();
        if !matches!(inner.status.state, "ready" | "external") {
            return Err("Готового обновления пока нет.".into());
        }
        let pending = inner
            .pending
            .take()
            .ok_or("Готового обновления пока нет.")?;
        inner.status.state = "installing";
        pending
    };
    let result: Result<(), String> = match &pending {
        #[cfg(desktop)]
        Pending::Desktop(update, bytes) => {
            if let Err(error) = key
                .as_ref()
                .map_err(Clone::clone)
                .and_then(|key| verify_package(bytes, &update.signature, key, &update.version))
            {
                return Ok(service.discard(&error));
            } else {
                // Blocking installer work never holds the status mutex or runs on the UI thread.
                let update = update.clone();
                let bytes = bytes.clone();
                let installed =
                    tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await;
                match installed {
                    Ok(Ok(())) => {
                        app.restart();
                    }
                    _ => Err(
                        "Не удалось установить обновление. Закройте другие копии ЕЦЛ и повторите."
                            .into(),
                    ),
                }
            }
        }
        #[cfg(target_os = "android")]
        Pending::Android {
            path,
            signature,
            version,
        } => {
            let verify = std::fs::read(path)
                .map_err(|_| "Файл обновления недоступен.".to_string())
                .and_then(|bytes| verify_package(&bytes, signature, public_key(&app)?, version));
            match verify {
                Err(error) => return Ok(service.discard(&error)),
                Ok(()) => {
                    #[derive(Deserialize)]
                    struct Response {
                        status: String,
                    }
                    let response = app
                        .state::<AndroidInstaller>()
                        .0
                        .run_mobile_plugin::<Response>(
                            "installUpdate",
                            serde_json::json!({"path":path}),
                        );
                    match response {
                        Ok(response) => {
                            let mut inner = service.inner.lock().unwrap();
                            inner.status.state = "ready";
                            inner.status.message = if response.status == "permissionRequired" {
                                "Разрешите установку обновлений для ЕЦЛ в настройках Android, затем нажмите «Установить обновление» ещё раз."
                            } else { "Подтвердите установку в системном окне Android. Если вы отменили её, можно повторить." }.into();
                            Ok(())
                        }
                        Err(_) => Err("Не удалось открыть установщик Android. Проверьте разрешение на установку приложений.".into()),
                    }
                }
            }
        }
        #[cfg(mobile)]
        Pending::External(url) => {
            use tauri_plugin_opener::OpenerExt;
            app.opener()
                .open_url(url, None::<&str>)
                .map_err(|_| "Не удалось открыть магазин обновлений.".into())
        }
    };
    let mut inner = service.inner.lock().unwrap();
    let external = inner.status.action == "external";
    inner.pending = Some(pending);
    if let Err(error) = result {
        inner.status.state = if external { "external" } else { "ready" };
        inner.status.message = error;
    } else if inner.status.state == "installing" {
        inner.status.state = "external";
    }
    Ok(inner.status.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn releases_are_confined_to_the_configured_repository() {
        assert!(release_url(
            "https://github.com/org/app/releases/download/v1.2.3/ECL.apk",
            "org/app"
        )
        .is_ok());
        for url in [
            "http://github.com/org/app/releases/download/v1/a.apk",
            "https://github.com/evil/app/releases/download/v1/a.apk",
            "https://github.com/org/app/releases/download/v1/a.apk?token=x",
            "https://user:pass@github.com/org/app/releases/download/v1/a.apk",
            "https://github.com/org/app/releases/download/v1/nested/a.apk",
        ] {
            assert!(release_url(url, "org/app").is_err(), "{url}");
        }
    }
    #[test]
    fn updates_never_downgrade_or_install_prereleases() {
        assert!(newer("0.1.2", "0.1.1").unwrap());
        assert!(!newer("0.1.0", "0.1.1").unwrap());
        assert!(!newer("0.1.1", "0.1.1").unwrap());
        assert!(!newer("9.0.0-beta.1", "0.1.1").unwrap());
        assert!(newer("invalid", "0.1.1").is_err());
    }
    #[test]
    fn arbitrary_links_cannot_be_used_as_mobile_updates() {
        assert!(store_url("https://apps.apple.com/app/id123", true));
        assert!(store_url("https://testflight.apple.com/join/abc", true));
        assert!(!store_url("https://github.com/org/app/download.ipa", true));
        assert!(!store_url(
            "https://apps.apple.com.evil.org/app/id123",
            true
        ));
        assert!(!store_url(
            "https://user:secret@apps.apple.com/app/id123",
            true
        ));
    }
    #[test]
    fn missing_signatures_are_rejected() {
        assert!(verify_package(b"not signed", "", "", "0.1.1").is_err());
    }

    #[test]
    fn signed_package_is_accepted_but_modified_bytes_are_rejected() {
        let data = include_bytes!("../tests/fixtures/updater-payload.txt");
        let signature = include_str!("../tests/fixtures/updater-payload.txt.sig");
        let key = include_str!("../tests/fixtures/updater-public-key.txt");
        assert!(verify_package(data, signature, key, "1.2.3").is_ok());
        let mut tampered = data.to_vec();
        tampered[0] ^= 1;
        assert!(verify_package(&tampered, signature, key, "1.2.3").is_err());
    }

    #[test]
    fn valid_signed_old_package_cannot_impersonate_a_new_version() {
        let data = include_bytes!("../tests/fixtures/updater-payload.txt");
        let signature = include_str!("../tests/fixtures/updater-payload.txt.sig");
        let key = include_str!("../tests/fixtures/updater-public-key.txt");
        assert!(verify_package(data, signature, key, "9.0.0").is_err());
    }
}
