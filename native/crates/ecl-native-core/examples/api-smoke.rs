//! Read synthetic fixture credentials from stdin. Never print requests, tokens,
//! password values or response bodies. See the native API smoke harness.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use ecl_native_core::{ApiRequest, ApiResponse, Engine};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::BTreeMap, io::Read};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Input {
    server_url: String,
    phone: String,
    password: String,
    expected_role: String,
}

fn request(path: &str, method: &str, token: Option<&str>, body: Option<Value>) -> ApiRequest {
    let mut headers = BTreeMap::from([
        ("Accept".into(), "application/json".into()),
        ("X-Session-Refresh".into(), "1".into()),
    ]);
    if let Some(token) = token {
        headers.insert("Authorization".into(), format!("Bearer {token}"));
    }
    let body_base64 = body.map(|body| {
        headers.insert("Content-Type".into(), "application/json".into());
        STANDARD.encode(body.to_string())
    });
    ApiRequest {
        path: path.into(),
        method: method.into(),
        headers,
        body_base64,
        credentials: true,
    }
}

async fn call(
    engine: &Engine,
    request: ApiRequest,
    expected: u16,
    step: &str,
) -> Result<ApiResponse, String> {
    let response = engine
        .request(request)
        .await
        .map_err(|_| format!("{step}: transport failed"))?;
    if response.status != expected {
        return Err(format!(
            "{step}: expected {expected}, received {}",
            response.status
        ));
    }
    if response
        .headers
        .keys()
        .any(|name| name.to_ascii_lowercase().contains("cookie"))
    {
        return Err(format!("{step}: cookie exposed to the frontend"));
    }
    Ok(response)
}

fn parse(response: ApiResponse) -> Result<Value, String> {
    let bytes = STANDARD
        .decode(response.body_base64)
        .map_err(|_| "Invalid response encoding")?;
    serde_json::from_slice(&bytes).map_err(|_| "Invalid JSON response".into())
}

fn access_token(value: &Value) -> Result<&str, String> {
    value
        .get("accessToken")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| "Session response is missing accessToken".into())
}

async fn run() -> Result<Value, String> {
    let mut bytes = Vec::new();
    std::io::stdin()
        .take(16 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Could not read fixture input")?;
    if bytes.len() > 16 * 1024 {
        return Err("Fixture input is too large".into());
    }
    let input: Input = serde_json::from_slice(&bytes).map_err(|_| "Invalid fixture input")?;
    // This harness intentionally targets only ephemeral local test servers.
    if !input.server_url.starts_with("http://127.0.0.1:") {
        return Err("Smoke tests require a local fixture server".into());
    }
    let directory = tempfile::tempdir().map_err(|_| "Could not create temporary configuration")?;
    let engine = Engine::new(directory.path().into())?;
    engine.configure(input.server_url).await?;

    call(
        &engine,
        request("/api/v1/health/ready", "GET", None, None),
        200,
        "ready",
    )
    .await?;
    let session = parse(
        call(
            &engine,
            request(
                "/api/v1/auth/password",
                "POST",
                None,
                Some(json!({
                    "phone": input.phone, "password": input.password, "rememberDevice": true,
                })),
            ),
            200,
            "password",
        )
        .await?,
    )?;
    let actor = parse(
        call(
            &engine,
            request("/api/v1/me", "GET", Some(access_token(&session)?), None),
            200,
            "me",
        )
        .await?,
    )?;
    if actor.get("role").and_then(Value::as_str) != Some(input.expected_role.as_str()) {
        return Err("me: fixture role does not match expectedRole".into());
    }
    let refreshed = parse(
        call(
            &engine,
            request("/api/v1/auth/refresh", "POST", None, None),
            200,
            "refresh",
        )
        .await?,
    )?;
    call(
        &engine,
        request("/api/v1/me", "GET", Some(access_token(&refreshed)?), None),
        200,
        "refreshed me",
    )
    .await?;
    call(
        &engine,
        request(
            "/api/v1/auth/logout",
            "POST",
            Some(access_token(&refreshed)?),
            None,
        ),
        200,
        "logout",
    )
    .await?;
    call(
        &engine,
        request("/api/v1/auth/refresh", "POST", None, None),
        401,
        "refresh after logout",
    )
    .await?;
    Ok(
        json!({ "ok": true, "ready": 200, "password": 200, "me": 200, "role": input.expected_role, "refresh": 200, "logout": 200, "refreshAfterLogout": 401, "cookiesHidden": true }),
    )
}

#[tokio::main]
async fn main() {
    match run().await {
        Ok(report) => println!("{report}"),
        Err(error) => {
            println!("{}", json!({ "ok": false, "error": error }));
            std::process::exit(1);
        }
    }
}
