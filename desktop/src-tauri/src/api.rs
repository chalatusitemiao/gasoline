use std::{sync::Mutex, time::Duration};

use reqwest::{
    Client, Method, Url,
    header::{ACCEPT, CACHE_CONTROL, CONTENT_TYPE, ORIGIN},
    redirect::Policy,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Clone)]
struct ApiConnection {
    origin: Url,
    client: Client,
}

#[derive(Default)]
pub struct ApiState(Mutex<Option<ApiConnection>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequest {
    path: String,
    method: String,
    body: Option<String>,
    content_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse {
    status: u16,
    body: String,
    content_type: Option<String>,
}

fn parse_api_origin(address: &str) -> Result<Url, &'static str> {
    let origin = Url::parse(address).map_err(|_| "请输入有效的服务器地址")?;
    let local_debug_server = cfg!(debug_assertions)
        && origin.scheme() == "http"
        && matches!(origin.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));

    if origin.scheme() != "https" && !local_debug_server {
        return Err("服务器地址必须使用 HTTPS");
    }
    if origin.host().is_none()
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
    {
        return Err("请输入网站根地址，例如 https://example.com");
    }

    Ok(origin)
}

#[tauri::command]
pub fn set_api_origin(
    origin: Option<String>,
    state: State<'_, ApiState>,
) -> Result<Option<String>, &'static str> {
    let origin = origin.as_deref().map(parse_api_origin).transpose()?;
    let mut active = state.0.lock().map_err(|_| "无法读取客户端会话")?;
    let Some(origin) = origin else {
        *active = None;
        return Ok(None);
    };
    let canonical_origin = origin.origin().ascii_serialization();

    if active
        .as_ref()
        .is_some_and(|connection| connection.origin == origin)
    {
        return Ok(Some(canonical_origin));
    }

    let client = Client::builder()
        .cookie_store(true)
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "无法初始化服务器连接")?;

    *active = Some(ApiConnection { origin, client });
    Ok(Some(canonical_origin))
}

fn resolve_api_path(origin: &Url, path: &str) -> Result<Url, &'static str> {
    if !path.starts_with("/api/") || path.contains('\\') || path.chars().any(char::is_control) {
        return Err("请求路径无效");
    }

    let url = origin.join(path).map_err(|_| "请求路径无效")?;
    let normalized_path = url.path().to_ascii_lowercase();
    if url.origin() != origin.origin()
        || url.fragment().is_some()
        || !url.path().starts_with("/api/")
        || normalized_path.contains("%2f")
        || normalized_path.contains("%5c")
    {
        return Err("请求路径无效");
    }

    Ok(url)
}

#[tauri::command]
pub async fn api_request(
    request: ApiRequest,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, &'static str> {
    let connection = state
        .0
        .lock()
        .map_err(|_| "无法读取客户端会话")?
        .clone()
        .ok_or("请先配置服务器地址")?;
    let url = resolve_api_path(&connection.origin, &request.path)?;
    let method = match request.method.as_str() {
        "GET" => Method::GET,
        "HEAD" => Method::HEAD,
        "POST" => Method::POST,
        "PUT" => Method::PUT,
        "PATCH" => Method::PATCH,
        "DELETE" => Method::DELETE,
        "OPTIONS" => Method::OPTIONS,
        _ => return Err("请求方法无效"),
    };
    let needs_origin = !matches!(method, Method::GET | Method::HEAD | Method::OPTIONS);
    let mut builder = connection
        .client
        .request(method, url)
        .header(ACCEPT, "application/json")
        .header(CACHE_CONTROL, "no-store");

    if needs_origin {
        builder = builder.header(ORIGIN, connection.origin.origin().ascii_serialization());
    }
    if let Some(content_type) = request.content_type {
        builder = builder.header(CONTENT_TYPE, content_type);
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|error| {
        if error.is_timeout() {
            "服务器响应超时，请稍后重试"
        } else {
            "无法连接服务器，请检查地址和网络"
        }
    })?;
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let body = response.text().await.map_err(|_| "无法读取服务器响应")?;

    Ok(ApiResponse {
        status,
        body,
        content_type,
    })
}
