use super::*;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::mpsc,
    task::JoinHandle,
};

struct TestServer {
    origin: String,
    requests: mpsc::UnboundedReceiver<String>,
    task: JoinHandle<()>,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn server(replies: Vec<Vec<u8>>) -> TestServer {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (tx, requests) = mpsc::unbounded_channel();
    let task = tokio::spawn(async move {
        for reply in replies {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let size = socket.read(&mut buffer).await.unwrap();
                if size == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..size]);
                if let Some(offset) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..offset]);
                    let length: usize = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|s| s.trim().parse().unwrap())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= offset + 4 + length {
                        break;
                    }
                }
            }
            tx.send(String::from_utf8_lossy(&bytes).into_owned())
                .unwrap();
            // Oversized responses are intentionally terminated by the client.
            let _ = socket.write_all(&reply).await;
        }
    });
    TestServer {
        origin,
        requests,
        task,
    }
}

fn reply(headers: &str, body: &str) -> Vec<u8> {
    format!(
        "HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: {}\r\n{}\r\n{}",
        body.len(),
        headers,
        body
    )
    .into_bytes()
}

fn get(path: &str, credentials: bool) -> ApiRequest {
    ApiRequest {
        path: path.into(),
        method: "GET".into(),
        headers: BTreeMap::new(),
        body_base64: None,
        credentials,
    }
}

async fn configured(origin: &str) -> (tempfile::TempDir, Engine) {
    let directory = tempfile::tempdir().unwrap();
    let engine = Engine::new(directory.path().into()).unwrap();
    engine.configure(origin.to_owned()).await.unwrap();
    (directory, engine)
}

#[test]
fn origins_are_normalized_without_permitting_unsafe_addresses() {
    for (source, expected) in [
        (" https://ECL.example:443/ ", "https://ecl.example"),
        ("https://example.com:8443", "https://example.com:8443"),
        ("http://localhost:3000/", "http://localhost:3000"),
        ("http://127.0.0.1:3000", "http://127.0.0.1:3000"),
        ("http://[::1]:3000", "http://[::1]:3000"),
    ] {
        assert_eq!(normalize_server_url(source).unwrap(), expected);
    }
    for source in [
        "example.com",
        "http://example.com",
        "http://192.168.1.10",
        "http://127.1",
        "http://2130706433",
        "http://0x7f000001",
        "http://127.0.0.2",
        "http://localhost.",
        "http://localhost.evil.example",
        "http://[::ffff:127.0.0.1]",
        "file:///tmp/foo",
        "https://user:password@example.com",
        "https://example.com/api/v1",
        "https://example.com/?x=1",
        "https://example.com/#secret",
        "https://example.com/\\evil",
        "https://example.com\n",
        "https:example.com",
        "https://@example.com",
        "https://example.com/path/..",
        "https://example.com/./",
    ] {
        assert!(normalize_server_url(source).is_err(), "accepted {source}");
    }
}

#[test]
fn api_paths_allow_queries_but_never_origin_escape_or_traversal() {
    for path in [
        "/api/v1/auth/login",
        "/api/v1/trips?cursor=a%2Fb%3D",
        "/api/v1/documents/a%20b.pdf",
        "/api/v1/trips/%D0%A2%D0%B5%D1%81%D1%82",
    ] {
        validate_api_path(path).unwrap();
    }
    for path in [
        "https://evil.example/api/v1/auth",
        "//evil.example/api/v1/auth",
        "/api/v10/test",
        "/api/v1/../admin",
        "/api/v1/./trips",
        "/api/v1/%2e%2e/admin",
        "/api/v1/.%2E/admin",
        "/api/v1/%252e%252e/admin",
        "/api/v1/%2fadmin",
        "/api/v1/%5cadmin",
        "/api/v1/\\admin",
        "/api/v1/a//b",
        "/api/v1/a#fragment",
        "/api/v1/%00admin",
        "/api/v1/%0aadmin",
        "/api/v1/%ff",
        "/api/v1/%",
        "/api/v1/%2",
        "/api/v1/%QQ",
        "/api/v1/a b",
        "/api/v1/%3fadmin",
    ] {
        assert!(validate_api_path(path).is_err(), "accepted {path}");
    }
}

#[test]
fn headers_methods_and_base64_are_restricted() {
    let allowed = BTreeMap::from([
        ("Authorization".into(), "Bearer test".into()),
        ("Content-Type".into(), "application/json".into()),
        ("Accept".into(), "application/json".into()),
        ("X-Session-Refresh".into(), "1".into()),
        ("X-Dev-Auth-Key".into(), "test".into()),
    ]);
    assert_eq!(validate_headers(allowed).unwrap().len(), 5);
    for name in [
        "Cookie",
        "Host",
        "Origin",
        "Referer",
        "Content-Length",
        "Proxy-Authorization",
        "Sec-Fetch-Site",
    ] {
        assert!(validate_headers(BTreeMap::from([(name.into(), "test".into())])).is_err());
    }
    assert!(validate_headers(BTreeMap::from([(
        "Authorization".into(),
        "bad\r\nCookie: leak".into()
    )]))
    .is_err());
    assert!(validate_headers(BTreeMap::from([
        ("Accept".into(), "a".into()),
        ("accept".into(), "b".into())
    ]))
    .is_err());
    for method in ["TRACE", "CONNECT", "get", "POST\r\n"] {
        assert!(validate_method(method).is_err());
    }
    assert_eq!(decode_body_base64("aGVsbG8=").unwrap(), b"hello");
    assert!(decode_body_base64("not base64!").is_err());
    assert!(decode_body_base64(&"A".repeat(MAX_BODY_BYTES.div_ceil(3) * 4 + 4)).is_err());
}

#[test]
fn invalid_disk_configuration_fails_closed() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(CONFIG_FILE);
    assert!(Engine::new(directory.path().into())
        .unwrap()
        .config()
        .unwrap()
        .is_none());
    for content in [
        "{",
        "{\"serverUrl\":\"http://evil.example\"}",
        "{\"serverUrl\":\"https://example.com\",\"accessToken\":\"secret\"}",
    ] {
        fs::write(&path, content).unwrap();
        assert!(Engine::new(directory.path().into()).is_err());
    }
    fs::write(&path, " ".repeat(MAX_CONFIG_BYTES as usize + 1)).unwrap();
    assert!(Engine::new(directory.path().into()).is_err());
}

#[tokio::test]
async fn damaged_config_recovery_cannot_connect_before_explicit_selection() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join(CONFIG_FILE);
    fs::write(&path, "damaged settings").unwrap();
    let engine = Engine::unconfigured(directory.path().into());
    assert!(engine.config().unwrap().is_none());
    assert!(engine.request(get("/api/v1/me", true)).await.is_err());
    assert_eq!(fs::read_to_string(&path).unwrap(), "damaged settings");
    engine
        .configure("https://example.com".into())
        .await
        .unwrap();
    assert_eq!(
        engine.config().unwrap().unwrap().server_url,
        "https://example.com"
    );
}

#[tokio::test]
async fn config_replacement_persists_only_normalized_origin() {
    let (directory, engine) = configured("https://EXAMPLE.com/").await;
    assert_eq!(
        engine.config().unwrap().unwrap().server_url,
        "https://example.com"
    );
    assert!(engine
        .configure("http://evil.example".into())
        .await
        .is_err());
    let loaded = Engine::new(directory.path().into()).unwrap();
    assert_eq!(loaded.config().unwrap(), engine.config().unwrap());
    let disk = fs::read_to_string(directory.path().join(CONFIG_FILE)).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&disk).unwrap(),
        serde_json::json!({"serverUrl": "https://example.com"})
    );
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[tokio::test]
async fn cookies_are_memory_only_hidden_and_require_credentials() {
    let mut server = server(vec![
        reply("Set-Cookie: session=remembered; HttpOnly; Path=/api/v1/auth\r\nSet-Cookie2: forbidden=1\r\nContent-Type: application/json\r\n", "{}"),
        reply("Set-Cookie: session=ignored; HttpOnly; Path=/api/v1/auth\r\n", "{}"),
        reply("", "{}"), reply("", "{}"), reply("", "{}"),
    ]).await;
    let (directory, engine) = configured(&server.origin).await;
    let response = engine
        .request(get("/api/v1/auth/login", true))
        .await
        .unwrap();
    assert!(!response.headers.contains_key("set-cookie"));
    assert!(!response.headers.contains_key("set-cookie2"));
    assert_eq!(response.headers["content-type"], "application/json");
    assert_eq!(response.body_base64, "e30=");
    let initial = server.requests.recv().await.unwrap().to_lowercase();
    assert!(initial.contains(&format!("origin: {}\r\n", server.origin)));
    assert!(!initial.contains("\r\ncookie:"));

    engine
        .request(get("/api/v1/auth/refresh", false))
        .await
        .unwrap();
    assert!(!server
        .requests
        .recv()
        .await
        .unwrap()
        .to_lowercase()
        .contains("\r\ncookie:"));
    engine
        .request(get("/api/v1/auth/refresh", true))
        .await
        .unwrap();
    assert!(server
        .requests
        .recv()
        .await
        .unwrap()
        .to_lowercase()
        .contains("cookie: session=remembered\r\n"));
    engine.request(get("/api/v1/trips", true)).await.unwrap();
    assert!(!server
        .requests
        .recv()
        .await
        .unwrap()
        .to_lowercase()
        .contains("\r\ncookie:"));

    let restarted = Engine::new(directory.path().into()).unwrap();
    restarted
        .request(get("/api/v1/auth/refresh", true))
        .await
        .unwrap();
    assert!(!server
        .requests
        .recv()
        .await
        .unwrap()
        .to_lowercase()
        .contains("\r\ncookie:"));
    assert!(!fs::read_to_string(directory.path().join(CONFIG_FILE))
        .unwrap()
        .contains("remembered"));
}

#[tokio::test]
async fn reconfiguring_clears_cookies_even_for_the_same_origin() {
    let mut server = server(vec![
        reply("Set-Cookie: session=old; Path=/\r\n", "{}"),
        reply("", "{}"),
    ])
    .await;
    let (_directory, engine) = configured(&server.origin).await;
    engine
        .request(get("/api/v1/auth/login", true))
        .await
        .unwrap();
    server.requests.recv().await.unwrap();
    engine.configure(server.origin.clone()).await.unwrap();
    engine
        .request(get("/api/v1/auth/refresh", true))
        .await
        .unwrap();
    assert!(!server
        .requests
        .recv()
        .await
        .unwrap()
        .to_lowercase()
        .contains("\r\ncookie:"));
}

#[tokio::test]
async fn redirects_are_returned_without_forwarding_authorization() {
    let mut destination = server(vec![reply("", "must not receive credentials")]).await;
    let source = server(vec![format!("HTTP/1.1 302 Found\r\nLocation: {}/api/v1/auth\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", destination.origin).into_bytes()]).await;
    let (_directory, engine) = configured(&source.origin).await;
    let mut request = get("/api/v1/auth/login", true);
    request
        .headers
        .insert("Authorization".into(), "Bearer test-secret".into());
    assert_eq!(engine.request(request).await.unwrap().status, 302);
    assert!(
        tokio::time::timeout(Duration::from_millis(80), destination.requests.recv())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn request_body_auth_and_binary_response_are_preserved() {
    let mut server = server(vec![reply("Content-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=test.bin\r\n", "binary")]).await;
    let (_directory, engine) = configured(&server.origin).await;
    let response = engine
        .request(ApiRequest {
            path: "/api/v1/documents?cursor=a%2Fb%3D&filter=all".into(),
            method: "POST".into(),
            headers: BTreeMap::from([
                ("Authorization".into(), "Bearer test-token".into()),
                ("Content-Type".into(), "application/json".into()),
            ]),
            body_base64: Some(STANDARD.encode("{\"name\":\"test\"}")),
            credentials: false,
        })
        .await
        .unwrap();
    let captured = server.requests.recv().await.unwrap();
    assert!(captured.starts_with("POST /api/v1/documents?cursor=a%2Fb%3D&filter=all HTTP/1.1\r\n"));
    assert!(captured.contains("authorization: Bearer test-token\r\n"));
    assert!(captured.ends_with("{\"name\":\"test\"}"));
    assert_eq!(STANDARD.decode(response.body_base64).unwrap(), b"binary");
    assert!(response.headers["content-disposition"].contains("test.bin"));
}

#[tokio::test]
async fn oversized_content_length_is_rejected_before_reading_body() {
    let server = server(vec![format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        MAX_BODY_BYTES + 1
    )
    .into_bytes()])
    .await;
    let (_directory, engine) = configured(&server.origin).await;
    assert!(engine
        .request(get("/api/v1/download", false))
        .await
        .err()
        .unwrap()
        .contains("40 MiB"));
}

#[tokio::test]
async fn chunked_response_cannot_bypass_body_limit() {
    let mut reply =
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".to_vec();
    let chunk = vec![b'x'; 1024 * 1024];
    for _ in 0..41 {
        reply.extend_from_slice(b"100000\r\n");
        reply.extend_from_slice(&chunk);
        reply.extend_from_slice(b"\r\n");
    }
    reply.extend_from_slice(b"0\r\n\r\n");
    let server = server(vec![reply]).await;
    let (_directory, engine) = configured(&server.origin).await;
    assert!(engine
        .request(get("/api/v1/download", false))
        .await
        .err()
        .unwrap()
        .contains("40 MiB"));
}

#[tokio::test]
async fn responses_from_a_previous_server_generation_are_rejected() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (_directory, engine) = configured(&origin).await;
    let engine = Arc::new(engine);
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    let server_task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buffer = [0; 4096];
        socket.read(&mut buffer).await.unwrap();
        ready_tx.send(()).unwrap();
        reply_rx.await.unwrap();
        socket
            .write_all(&reply("Set-Cookie: session=stale; Path=/\r\n", "old data"))
            .await
            .unwrap();
    });
    let requester = engine.clone();
    let request_task =
        tokio::spawn(async move { requester.request(get("/api/v1/auth/refresh", true)).await });
    ready_rx.await.unwrap();
    engine.configure(origin).await.unwrap();
    reply_tx.send(()).unwrap();
    assert!(request_task
        .await
        .unwrap()
        .err()
        .unwrap()
        .contains("Server changed"));
    server_task.await.unwrap();
}
