//! The native client owns server selection, TLS, request limits and session cookies.
//! It deliberately exposes neither arbitrary network access nor a persistent token store.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use percent_encoding::percent_decode_str;
use reqwest::{
    cookie::{CookieStore, Jar},
    header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, COOKIE, ORIGIN, SET_COOKIE},
    Client, Method, Url,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
    time::Duration,
};

pub const MAX_BODY_BYTES: usize = 40 * 1024 * 1024;
const MAX_CONFIG_BYTES: u64 = 8192;
const MAX_PATH_BYTES: usize = 16 * 1024;
const MAX_HEADER_BYTES: usize = 32 * 1024;
const CONFIG_FILE: &str = "native-config.json";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeConfig {
    pub server_url: String,
}

// Do not derive Debug: these fields can contain passwords and access tokens.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApiRequest {
    pub path: String,
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub body_base64: Option<String>,
    #[serde(default)]
    pub credentials: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body_base64: String,
}

struct Session {
    config: NativeConfig,
    origin: Url,
    client: Client,
    cookies: Jar,
}

/// Thread-safe Tauri state. Every reconfiguration creates a new session, including
/// when selecting the same server again. Pending old responses are rejected.
pub struct Engine {
    config_dir: PathBuf,
    session: RwLock<Option<Arc<Session>>>,
}

impl Engine {
    /// Recovery state for the application shell. Does not read or overwrite a
    /// damaged config; no network request is possible until explicit configure().
    pub fn unconfigured(config_dir: PathBuf) -> Self {
        Self {
            config_dir,
            session: RwLock::new(None),
        }
    }

    pub fn new(config_dir: PathBuf) -> Result<Self, String> {
        let config = read_config(&config_dir.join(CONFIG_FILE))?;
        let session = config.map(Session::new).transpose()?.map(Arc::new);
        Ok(Self {
            config_dir,
            session: RwLock::new(session),
        })
    }

    pub fn config(&self) -> Result<Option<NativeConfig>, String> {
        let session = self.session.read().map_err(|_| state_error())?;
        Ok(session.as_ref().map(|session| session.config.clone()))
    }

    pub async fn configure(&self, server_url: String) -> Result<NativeConfig, String> {
        let config = NativeConfig {
            server_url: normalize_server_url(&server_url)?,
        };
        let next = Arc::new(Session::new(config.clone())?);
        // Keep file replacement and memory replacement in the same critical section.
        // A failed write leaves the existing session untouched.
        let mut session = self.session.write().map_err(|_| state_error())?;
        persist_config(&self.config_dir, &config)?;
        *session = Some(next);
        Ok(config)
    }

    pub async fn request(&self, request: ApiRequest) -> Result<ApiResponse, String> {
        validate_api_path(&request.path)?;
        let method = validate_method(&request.method)?;
        let headers = validate_headers(request.headers)?;
        let body = request
            .body_base64
            .as_deref()
            .map(decode_body_base64)
            .transpose()?;
        if matches!(method, Method::GET | Method::HEAD)
            && body.as_ref().is_some_and(|bytes| !bytes.is_empty())
        {
            return Err("GET and HEAD requests cannot include a body".into());
        }
        let session = self
            .session
            .read()
            .map_err(|_| state_error())?
            .clone()
            .ok_or("Select an ECL server before signing in")?;
        let target = session
            .origin
            .join(&request.path)
            .map_err(|_| "Invalid API path")?;
        if target.origin() != session.origin.origin() || !target.path().starts_with("/api/v1/") {
            return Err("API request must remain on the selected server".into());
        }
        let mut builder = session
            .client
            .request(method, target.clone())
            .headers(headers)
            // The API validates Origin for its remembered-session endpoints. The
            // packaged WebView's custom protocol is not the origin of the backend.
            .header(ORIGIN, session.config.server_url.as_str());
        if request.credentials {
            if let Some(mut cookie) = session.cookies.cookies(&target) {
                cookie.set_sensitive(true);
                builder = builder.header(COOKIE, cookie);
            }
        }
        if let Some(body) = body {
            builder = builder.body(body);
        }
        let mut response = builder.send().await.map_err(network_error)?;
        if response
            .content_length()
            .is_some_and(|size| size > MAX_BODY_BYTES as u64)
        {
            return Err("Server response exceeds the 40 MiB limit".into());
        }
        let status = response.status().as_u16();
        let headers = response_headers(response.headers());
        let set_cookies: Vec<HeaderValue> = if request.credentials {
            response
                .headers()
                .get_all(SET_COOKIE)
                .iter()
                .cloned()
                .collect()
        } else {
            Vec::new()
        };
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(network_error)? {
            if chunk.len() > MAX_BODY_BYTES - body.len() {
                return Err("Server response exceeds the 40 MiB limit".into());
            }
            body.extend_from_slice(&chunk);
        }
        // Holding this read guard also prevents configure() from replacing the
        // session while response cookies are committed. No cookie or old-server
        // response can be moved into the newly configured session.
        let current = self.session.read().map_err(|_| state_error())?;
        if !current
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &session))
        {
            return Err("Server changed while the request was running; reload the screen".into());
        }
        if request.credentials {
            session
                .cookies
                .set_cookies(&mut set_cookies.iter(), &target);
        }
        Ok(ApiResponse {
            status,
            headers,
            body_base64: STANDARD.encode(body),
        })
    }
}

impl Session {
    fn new(config: NativeConfig) -> Result<Self, String> {
        let origin = Url::parse(&config.server_url).map_err(|_| "Invalid server address")?;
        let client = Client::builder()
            .use_rustls_tls()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(120))
            .user_agent(concat!("ECL-Native/", env!("CARGO_PKG_VERSION")))
            // Cookies are handled explicitly per request, never by this client.
            .build()
            .map_err(|_| "Could not initialize secure network transport")?;
        Ok(Self {
            config,
            origin,
            client,
            cookies: Jar::default(),
        })
    }
}

/// Accept an origin, not an arbitrary base URL. Plain HTTP is restricted to
/// exact loopback host spellings so shorthand/decimal IP addresses cannot pass.
pub fn normalize_server_url(input: &str) -> Result<String, String> {
    if input.len() > 2048 || input.chars().any(|c| c.is_control()) || input.contains('\\') {
        return Err("Invalid server address".into());
    }
    let input = input.trim();
    let (_, raw_address) = input
        .split_once("://")
        .ok_or("Enter a complete HTTPS server address")?;
    let (raw_authority, raw_path) = raw_address.split_once('/').unwrap_or((raw_address, ""));
    if raw_authority.contains('@') || !raw_path.is_empty() {
        return Err("Server address must contain only its origin, without login or path".into());
    }
    let url = Url::parse(input).map_err(|_| "Enter a complete HTTPS server address")?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || url.host_str().is_none()
    {
        return Err(
            "Server address must contain only its origin, without login, path, query or fragment"
                .into(),
        );
    }
    match url.scheme() {
        "https" => {}
        "http" => {
            let authority = raw_authority;
            let raw_host = if authority.starts_with('[') {
                authority
                    .find(']')
                    .map(|end| &authority[..=end])
                    .unwrap_or_default()
            } else {
                authority.split(':').next().unwrap_or_default()
            };
            if !matches!(
                raw_host.to_ascii_lowercase().as_str(),
                "localhost" | "127.0.0.1" | "[::1]"
            ) {
                return Err("HTTP is permitted only for localhost, 127.0.0.1 or [::1]; use HTTPS for a remote server".into());
            }
        }
        _ => return Err("Only HTTPS server addresses are supported".into()),
    }
    Ok(url.origin().ascii_serialization())
}

pub fn validate_api_path(path: &str) -> Result<(), String> {
    if path.len() > MAX_PATH_BYTES
        || !path.starts_with("/api/v1/")
        || path.contains(['#', '\\'])
        || path.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err("Only relative /api/v1/ API paths are permitted".into());
    }
    let pathname = path.split('?').next().unwrap_or_default();
    let bytes = pathname.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return Err("Malformed percent encoding in API path".into());
            }
            index += 2;
        }
        index += 1;
    }
    let decoded = percent_decode_str(pathname)
        .decode_utf8()
        .map_err(|_| "Invalid UTF-8 in API path")?;
    if decoded.contains(['\\', '%', '?', '#'])
        || decoded.chars().any(|c| c.is_control())
        || decoded.matches('/').count() != pathname.matches('/').count()
        || decoded.contains("//")
        || decoded
            .split('/')
            .any(|segment| matches!(segment, "." | ".."))
    {
        return Err("API paths cannot contain traversal or encoded separators".into());
    }
    Ok(())
}

pub fn decode_body_base64(encoded: &str) -> Result<Vec<u8>, String> {
    if encoded.len() > MAX_BODY_BYTES.div_ceil(3) * 4 {
        return Err("Request body exceeds the 40 MiB limit".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid base64 request body")?;
    if bytes.len() > MAX_BODY_BYTES {
        return Err("Request body exceeds the 40 MiB limit".into());
    }
    Ok(bytes)
}

fn validate_method(method: &str) -> Result<Method, String> {
    match method {
        "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" => {
            Method::from_bytes(method.as_bytes()).map_err(|_| "Invalid request method".into())
        }
        _ => Err("Unsupported API request method".into()),
    }
}

fn validate_headers(input: BTreeMap<String, String>) -> Result<HeaderMap, String> {
    if input.len() > 5
        || input
            .iter()
            .map(|(key, value)| key.len() + value.len())
            .sum::<usize>()
            > MAX_HEADER_BYTES
    {
        return Err("Request headers exceed the allowed size".into());
    }
    let mut headers = HeaderMap::new();
    for (name, value) in input {
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|_| "Invalid request header")?;
        if !matches!(
            name.as_str(),
            "authorization" | "content-type" | "accept" | "x-session-refresh" | "x-dev-auth-key"
        ) {
            return Err(format!(
                "Request header is not permitted: {}",
                name.as_str()
            ));
        }
        if headers.contains_key(&name) {
            return Err("Duplicate request header".into());
        }
        let mut value =
            HeaderValue::from_str(&value).map_err(|_| "Invalid request header value")?;
        if name == AUTHORIZATION || name.as_str() == "x-dev-auth-key" {
            value.set_sensitive(true);
        }
        headers.insert(name, value);
    }
    Ok(headers)
}

fn response_headers(input: &HeaderMap) -> BTreeMap<String, String> {
    input
        .iter()
        .filter_map(|(name, value)| {
            if matches!(
                name.as_str(),
                "set-cookie"
                    | "set-cookie2"
                    | "cookie"
                    | "cookie2"
                    | "authorization"
                    | "proxy-authorization"
            ) {
                return None;
            }
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_owned()))
        })
        .collect()
}

fn read_config(path: &Path) -> Result<Option<NativeConfig>, String> {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Could not read native server configuration".into()),
    };
    let mut contents = Vec::new();
    Read::by_ref(&mut file)
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut contents)
        .map_err(|_| "Could not read native server configuration")?;
    if contents.len() as u64 > MAX_CONFIG_BYTES {
        return Err("Native server configuration is too large".into());
    }
    let config: NativeConfig =
        serde_json::from_slice(&contents).map_err(|_| "Native server configuration is invalid")?;
    Ok(Some(NativeConfig {
        server_url: normalize_server_url(&config.server_url)?,
    }))
}

fn persist_config(directory: &Path, config: &NativeConfig) -> Result<(), String> {
    fs::create_dir_all(directory).map_err(|_| "Could not create the configuration directory")?;
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|_| "Could not encode native server configuration")?;
    let mut file = tempfile::NamedTempFile::new_in(directory)
        .map_err(|_| "Could not prepare native server configuration")?;
    file.write_all(&bytes)
        .map_err(|_| "Could not save native server configuration")?;
    file.as_file()
        .sync_all()
        .map_err(|_| "Could not flush native server configuration")?;
    file.persist(directory.join(CONFIG_FILE))
        .map_err(|_| "Could not replace native server configuration")?;
    Ok(())
}

fn state_error() -> String {
    "Native session state is unavailable; restart the application".into()
}

fn network_error(error: reqwest::Error) -> String {
    // reqwest errors may contain sensitive query parameters. Never return their URL.
    if error.is_timeout() {
        "Server request timed out; check your connection before retrying".into()
    } else {
        use std::error::Error;
        let mut cause = error.source();
        while let Some(source) = cause {
            let detail = source.to_string().to_ascii_lowercase();
            if detail.contains("certificate") || detail.contains("tls") || detail.contains("ssl") {
                return "Could not verify the server TLS certificate".into();
            }
            cause = source.source();
        }
        "Could not connect to ECL; check your connection and that the server is running".into()
    }
}

#[cfg(test)]
mod tests;
