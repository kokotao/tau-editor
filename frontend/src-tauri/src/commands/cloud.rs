/**
 * @description lizi 账号登录与云文档同步的 Tauri 命令层：JWT 只在 Rust 内存与系统凭据库中流转，日志不落敏感信息
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 10:00
 */
use std::fs;
use std::sync::OnceLock;
use std::time::UNIX_EPOCH;

use reqwest::{Client, RequestBuilder, Response, StatusCode};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::State;
use tokio::sync::Mutex;

use crate::models::CommandError;

/// 云文档服务默认地址；`cloud_login` 允许传入自定义 base_url 覆盖。
pub const DEFAULT_BASE_URL: &str = "https://note.lizipro.cn/lizi";
/// 系统凭据库中的服务名（固定为应用标识）。
const KEYRING_SERVICE: &str = "com.texteditor.tau";
/// 系统凭据库中的账号名（固定为 lizi 云端凭据条目）。
const KEYRING_USER: &str = "lizi-cloud";
/// 服务端 JWT 请求/响应头；请求时直接放原始 token，不加 `Bearer ` 前缀（见 lizi `JwtUtils.AUTH_HEADER`）。
const AUTH_HEADER: &str = "X-Authorization-Lizi";
/// 刷新令牌头：仅用于落库，普通接口不得携带（否则服务端按非法请求 401）。
const REFRESH_AUTH_HEADER: &str = "Refresh-Authorization";
/// 云文档接口前缀。
const CLOUD_DOCS_PATH: &str = "/miniProgram/cloud/docs";
const HTTP_USER_AGENT: &str = "tau-editor-cloud/1.0";
/// 服务端错误消息截断长度，避免把整段响应体灌进前端提示。
const MAX_ERROR_MESSAGE_CHARS: usize = 300;

/// 会话信息（暴露给前端的最小信息集，不含任何令牌）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSessionInfo {
    pub signed_in: bool,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub base_url: String,
}

/// 云空间用量信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocSpace {
    #[serde(deserialize_with = "deserialize_stringish")]
    pub user_id: String,
    pub used_bytes: i64,
    pub quota_bytes: i64,
    pub file_count: i64,
    pub max_version_per_file: i32,
}

/// 云文档列表项（不含正文）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocItem {
    pub file_id: i64,
    pub path: String,
    pub title: String,
    #[serde(default)]
    pub content_hash: Option<String>,
    pub size: i64,
    pub version: i32,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub category_id: Option<i64>,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub visibility: Option<String>,
    #[serde(default)]
    pub published_article_id: Option<i64>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// 云文档详情：列表项字段平铺 + 正文 + 创建时间（与 TS `interface CloudDocDetail extends CloudDocItem` 对齐）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocDetail {
    #[serde(flatten)]
    pub item: CloudDocItem,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// 云文档分页结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocPage {
    #[serde(default)]
    pub records: Vec<CloudDocItem>,
    pub total: i64,
    pub page: i64,
    pub size: i64,
}

/// 云文档历史版本（不含正文）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocVersion {
    pub version_id: i64,
    pub version: i32,
    #[serde(default)]
    pub content_hash: Option<String>,
    pub size: i64,
    #[serde(default)]
    pub remark: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// 保存/恢复结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocSaveResult {
    pub file_id: i64,
    pub version: i32,
    pub content_hash: String,
    pub size: i64,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// 保存请求体；`content` 与 `contentBase64` 二选一，其余元数据缺省视为「不修改」。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocSavePayload {
    pub path: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub content_base64: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub base_version: Option<i32>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub category_id: Option<i64>,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub visibility: Option<String>,
}

/// 本地文件作为同步源时的读取结果（内容 + 与云端一致的 `sha256:<hex>` 摘要）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudSyncSource {
    pub content: String,
    pub content_hash: String,
    pub size: i64,
    pub modified_ms: Option<i64>,
}

/// keyring 中持久化的凭据结构（只在 Rust 内部编解码，绝不下发前端）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCredential {
    token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    refresh_token: Option<String>,
    base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    username: Option<String>,
}

/// 内存中的活动会话副本，从 keyring 恢复或登录成功后建立。
#[derive(Debug, Clone)]
struct CloudSession {
    token: String,
    refresh_token: Option<String>,
    base_url: String,
    user_id: Option<String>,
    username: Option<String>,
}

impl CloudSession {
    fn info(&self) -> CloudSessionInfo {
        CloudSessionInfo {
            signed_in: true,
            user_id: self.user_id.clone(),
            username: self.username.clone(),
            base_url: self.base_url.clone(),
        }
    }

    fn from_stored(stored: StoredCredential) -> Self {
        Self {
            token: stored.token,
            refresh_token: stored.refresh_token,
            base_url: stored.base_url,
            user_id: stored.user_id,
            username: stored.username,
        }
    }

    fn to_stored(&self) -> StoredCredential {
        StoredCredential {
            token: self.token.clone(),
            refresh_token: self.refresh_token.clone(),
            base_url: self.base_url.clone(),
            user_id: self.user_id.clone(),
            username: self.username.clone(),
        }
    }
}

/// 云文档会话状态：内存缓存当前会话，keyring 作为跨启动的凭据来源。
#[derive(Default)]
pub struct CloudState {
    session: Mutex<Option<CloudSession>>,
}

/// 服务端统一返回体 `{success, code, message, data}`；`data` 先按 JSON 收下，再按命令各自解析。
#[derive(Deserialize)]
struct ApiEnvelope {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    code: Option<i64>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    data: Option<Value>,
}

/// `POST /user/login` 返回的 data（仅取会话展示需要的两个字段）。
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginUserInfo {
    #[serde(default)]
    user_name: Option<String>,
    #[serde(default, deserialize_with = "deserialize_opt_stringish")]
    user_id: Option<String>,
}

/// 云文档命令全部实现（与 P1 契约 §2 一一对应）。
#[tauri::command]
pub async fn cloud_login(
    state: State<'_, CloudState>,
    base_url: Option<String>,
    username: String,
    password: String,
) -> Result<CloudSessionInfo, CommandError> {
    let base_url = normalize_base_url(base_url)?;
    let username = username.trim().to_string();
    if username.is_empty() || password.is_empty() {
        return Err(CommandError::new(
            "INVALID_ARGUMENT",
            "lizi 账号和密码不能为空",
        ));
    }

    let client = http_client()?;
    let response = client
        .post(format!("{base_url}/user/login"))
        .header("Accept", "application/json")
        .form(&[
            ("username", username.as_str()),
            ("password", password.as_str()),
        ])
        .send()
        .await
        .map_err(|error| network_error("登录 lizi 账号", error))?;

    // 令牌在响应头里，必须先于读取响应体取出。
    let token = header_value(&response, AUTH_HEADER);
    let refresh_token = header_value(&response, REFRESH_AUTH_HEADER);
    let login_user: LoginUserInfo = parse_result(response, "登录 lizi 账号").await?;
    let token = token.ok_or_else(|| {
        CommandError::new("UNAUTHORIZED", "登录响应缺少访问令牌，请稍后重试")
    })?;

    // 用 /me 实测令牌可用，失败则不入库，避免把无效凭据写进 keyring。
    let me_response = client
        .get(format!("{base_url}{CLOUD_DOCS_PATH}/me"))
        .header(AUTH_HEADER, token.as_str())
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| network_error("校验 lizi 登录状态", error))?;
    let space: CloudDocSpace = parse_result(me_response, "校验 lizi 登录状态").await?;

    let session = CloudSession {
        token,
        refresh_token,
        base_url: base_url.clone(),
        user_id: Some(space.user_id)
            .filter(|value| !value.is_empty())
            .or(login_user.user_id),
        username: login_user
            .user_name
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or(Some(username)),
    };

    // keyring 不可用时仍允许本次会话使用，但下次启动需要重新登录。
    if let Err(error) = persist_credential(&session) {
        log::warn!("lizi 凭据未能写入系统凭据库：{}", error.message);
    }

    let info = session.info();
    *state.session.lock().await = Some(session);
    log::info!("lizi 云文档登录成功（base_url={base_url}）");
    Ok(info)
}

#[tauri::command]
pub async fn cloud_logout(state: State<'_, CloudState>) -> Result<(), CommandError> {
    {
        *state.session.lock().await = None;
    }
    clear_credential()?;
    log::info!("lizi 云文档已退出登录");
    Ok(())
}

#[tauri::command]
pub async fn cloud_session(state: State<'_, CloudState>) -> Result<CloudSessionInfo, CommandError> {
    let mut cached = state.session.lock().await;
    if cached.is_none() {
        if let Some(stored) = load_stored_credential() {
            *cached = Some(CloudSession::from_stored(stored));
        }
    }
    match cached.as_ref() {
        Some(session) => Ok(session.info()),
        None => Ok(CloudSessionInfo {
            signed_in: false,
            user_id: None,
            username: None,
            base_url: DEFAULT_BASE_URL.to_string(),
        }),
    }
}

#[tauri::command]
pub async fn cloud_docs_me(state: State<'_, CloudState>) -> Result<CloudDocSpace, CommandError> {
    let session = current_session(&state).await?;
    let client = http_client()?;
    let response = authed(
        client.get(format!("{}{CLOUD_DOCS_PATH}/me", session.base_url)),
        &session,
    )
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|error| network_error("获取云空间信息", error))?;
    parse_result(response, "获取云空间信息").await
}

#[tauri::command]
pub async fn cloud_docs_list(
    state: State<'_, CloudState>,
    path_prefix: Option<String>,
    keyword: Option<String>,
    page: Option<u32>,
    size: Option<u32>,
) -> Result<CloudDocPage, CommandError> {
    let session = current_session(&state).await?;
    let client = http_client()?;

    let mut query: Vec<(&str, String)> = Vec::new();
    if let Some(prefix) = path_prefix
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        query.push(("pathPrefix", prefix.to_string()));
    }
    if let Some(keyword) = keyword
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        query.push(("keyword", keyword.to_string()));
    }
    query.push(("page", page.unwrap_or(1).max(1).to_string()));
    query.push(("size", size.unwrap_or(50).clamp(1, 100).to_string()));

    let response = authed(
        client.get(format!("{}{CLOUD_DOCS_PATH}", session.base_url)),
        &session,
    )
    .header("Accept", "application/json")
    .query(&query)
    .send()
    .await
    .map_err(|error| network_error("获取云文档列表", error))?;
    parse_result(response, "获取云文档列表").await
}

#[tauri::command]
pub async fn cloud_docs_get(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<CloudDocDetail, CommandError> {
    let session = current_session(&state).await?;
    let client = http_client()?;
    let response = authed(
        client.get(format!("{}{CLOUD_DOCS_PATH}/{file_id}", session.base_url)),
        &session,
    )
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|error| network_error("获取云文档详情", error))?;
    parse_result(response, "获取云文档详情").await
}

#[tauri::command]
pub async fn cloud_docs_save(
    state: State<'_, CloudState>,
    payload: CloudDocSavePayload,
) -> Result<CloudDocSaveResult, CommandError> {
    if payload.path.trim().is_empty() {
        return Err(CommandError::new("INVALID_ARGUMENT", "缺少云文档路径"));
    }

    let session = current_session(&state).await?;
    let client = http_client()?;
    let response = authed(
        client.post(format!("{}{CLOUD_DOCS_PATH}", session.base_url)),
        &session,
    )
    .header("Accept", "application/json")
    .header("X-Device-Id", device_id().as_str())
    .json(&payload)
    .send()
    .await
    .map_err(|error| network_error("保存云文档", error))?;
    parse_result(response, "保存云文档").await
}

#[tauri::command]
pub async fn cloud_docs_versions(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<Vec<CloudDocVersion>, CommandError> {
    let session = current_session(&state).await?;
    let client = http_client()?;
    let response = authed(
        client.get(format!(
            "{}{CLOUD_DOCS_PATH}/{file_id}/versions",
            session.base_url
        )),
        &session,
    )
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|error| network_error("获取云文档历史版本", error))?;
    parse_result(response, "获取云文档历史版本").await
}

#[tauri::command]
pub async fn cloud_docs_restore(
    state: State<'_, CloudState>,
    file_id: i64,
    version_id: i64,
) -> Result<CloudDocSaveResult, CommandError> {
    let session = current_session(&state).await?;
    let client = http_client()?;
    let response = authed(
        client.post(format!(
            "{}{CLOUD_DOCS_PATH}/{file_id}/versions/{version_id}/restore",
            session.base_url
        )),
        &session,
    )
    .header("Accept", "application/json")
    .header("X-Device-Id", device_id().as_str())
    .send()
    .await
    .map_err(|error| network_error("恢复云文档历史版本", error))?;
    parse_result(response, "恢复云文档历史版本").await
}

#[tauri::command]
pub async fn cloud_docs_delete(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<(), CommandError> {
    let session = current_session(&state).await?;
    let client = http_client()?;
    let response = authed(
        client.delete(format!("{}{CLOUD_DOCS_PATH}/{file_id}", session.base_url)),
        &session,
    )
    .header("Accept", "application/json")
    .header("X-Device-Id", device_id().as_str())
    .send()
    .await
    .map_err(|error| network_error("删除云文档", error))?;
    parse_unit(response, "删除云文档").await
}

#[tauri::command]
pub fn cloud_read_sync_source(
    path: String,
    max_bytes: u64,
) -> Result<CloudSyncSource, CommandError> {
    let path = path.trim();
    if path.is_empty() {
        return Err(CommandError::new("INVALID_ARGUMENT", "缺少待同步文件路径"));
    }

    let metadata = fs::metadata(path).map_err(|error| {
        CommandError::new("IO_ERROR", format!("读取待同步文件失败：{error}"))
    })?;
    if !metadata.is_file() {
        return Err(CommandError::new(
            "INVALID_ARGUMENT",
            "待同步路径不是普通文件",
        ));
    }
    if metadata.len() > max_bytes {
        return Err(CommandError::new(
            "FILE_TOO_LARGE",
            format!("待同步文件超过 {max_bytes} 字节上限"),
        ));
    }

    let bytes = fs::read(path).map_err(|error| {
        CommandError::new("IO_ERROR", format!("读取待同步文件失败：{error}"))
    })?;
    // 文件可能在 metadata 之后继续增长，落内容前再判一次上限。
    if bytes.len() as u64 > max_bytes {
        return Err(CommandError::new(
            "FILE_TOO_LARGE",
            format!("待同步文件超过 {max_bytes} 字节上限"),
        ));
    }

    let content = String::from_utf8(bytes).map_err(|_| {
        CommandError::new("BINARY_FILE", "待同步文件不是 UTF-8 文本，暂不支持云端同步")
    })?;
    let content_hash = format!("sha256:{}", sha256_hex(content.as_bytes()));
    let size = content.len() as i64;

    Ok(CloudSyncSource {
        content,
        content_hash,
        size,
        modified_ms: metadata_modified_ms(&metadata),
    })
}

/// 生成 `sha256:<hex>`（与云端 `CloudDocServiceImpl` 的 hash 归一化保持一致）。
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn metadata_modified_ms(metadata: &fs::Metadata) -> Option<i64> {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
}

/// 统一的 HTTP 客户端（rustls + 固定 UA），进程内复用连接池。
fn http_client() -> Result<Client, CommandError> {
    static CLIENT: OnceLock<Option<Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            Client::builder()
                .user_agent(HTTP_USER_AGENT)
                .build()
                .ok()
        })
        .clone()
        .ok_or_else(|| CommandError::new("NETWORK_ERROR", "初始化 HTTP 客户端失败"))
}

fn device_id() -> String {
    format!("tau-editor-{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

fn authed(request: RequestBuilder, session: &CloudSession) -> RequestBuilder {
    request.header(AUTH_HEADER, session.token.as_str())
}

/// 取内存会话；未登录时尝试从 keyring 恢复，两者都没有则要求重新登录。
async fn current_session(state: &CloudState) -> Result<CloudSession, CommandError> {
    let mut cached = state.session.lock().await;
    if cached.is_none() {
        if let Some(stored) = load_stored_credential() {
            *cached = Some(CloudSession::from_stored(stored));
        }
    }
    cached
        .clone()
        .ok_or_else(|| CommandError::new("UNAUTHORIZED", "尚未登录 lizi 账号，请先登录"))
}

fn normalize_base_url(raw: Option<String>) -> Result<String, CommandError> {
    let candidate = raw
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut base = candidate.unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
    if !(base.starts_with("https://") || base.starts_with("http://")) {
        return Err(CommandError::new(
            "INVALID_BASE_URL",
            "服务器地址必须以 http:// 或 https:// 开头",
        ));
    }
    while base.ends_with('/') {
        base.pop();
    }
    if base.is_empty() || base == "https:" || base == "http:" {
        return Err(CommandError::new("INVALID_BASE_URL", "服务器地址无效"));
    }
    Ok(base)
}

fn header_value(response: &Response, name: &str) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

/// 令牌失效统一文案：不区分「过期」「被撤销」，避免泄露服务端判定细节。
fn unauthorized_error(action: &str) -> CommandError {
    CommandError::new(
        "UNAUTHORIZED",
        format!("{action}失败：登录状态已失效，请重新登录 lizi 账号"),
    )
}

fn truncate_message(message: &str) -> String {
    let trimmed = message.trim();
    if trimmed.chars().count() <= MAX_ERROR_MESSAGE_CHARS {
        return trimmed.to_string();
    }
    trimmed.chars().take(MAX_ERROR_MESSAGE_CHARS).collect()
}

/// body.code → CommandError 映射（契约 §0）：409 冲突、413 配额、其余服务端错误。
fn map_failure(code: Option<i64>, message: Option<&str>, action: &str) -> CommandError {
    let detail = message.map(truncate_message).filter(|value| !value.is_empty());
    match code {
        Some(401) => CommandError::new("UNAUTHORIZED", detail.unwrap_or_else(|| {
            "登录状态已失效，请重新登录 lizi 账号".to_string()
        })),
        Some(409) => CommandError::new("CONFLICT", detail.unwrap_or_else(|| {
            "云端版本冲突，请先拉取最新内容".to_string()
        })),
        Some(413) => CommandError::new(
            "QUOTA_EXCEEDED",
            detail.unwrap_or_else(|| "云端空间不足".to_string()),
        ),
        _ => CommandError::new(
            "SERVER_ERROR",
            detail.unwrap_or_else(|| format!("{action}失败：服务端处理失败")),
        ),
    }
}

async fn read_envelope(
    response: Response,
    status: StatusCode,
    action: &str,
) -> Result<ApiEnvelope, CommandError> {
    let body = response.text().await.map_err(|error| {
        CommandError::new(
            "NETWORK_ERROR",
            format!("{action}失败：读取服务端响应失败（{error}）"),
        )
    })?;
    serde_json::from_str::<ApiEnvelope>(&body).map_err(|_| {
        CommandError::new(
            "SERVER_ERROR",
            format!("{action}失败：服务端返回异常（HTTP {}）", status.as_u16()),
        )
    })
}

/// 解析 `{success, code, message, data}` 并取 data；401 与业务错误码统一转 CommandError。
async fn parse_result<T: DeserializeOwned>(
    response: Response,
    action: &str,
) -> Result<T, CommandError> {
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED {
        return Err(unauthorized_error(action));
    }
    let envelope = read_envelope(response, status, action).await?;
    if status.is_success() && envelope.success && envelope.code.unwrap_or(200) == 200 {
        let data = envelope
            .data
            .filter(|value| !value.is_null())
            .ok_or_else(|| {
                CommandError::new("SERVER_ERROR", format!("{action}失败：服务端未返回数据"))
            })?;
        return serde_json::from_value::<T>(data).map_err(|_| {
            CommandError::new(
                "SERVER_ERROR",
                format!("{action}失败：服务端返回的数据结构异常"),
            )
        });
    }
    Err(map_failure(envelope.code, envelope.message.as_deref(), action))
}

/// 无返回体的命令（DELETE）：只要 success/code 通过即可。
async fn parse_unit(response: Response, action: &str) -> Result<(), CommandError> {
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED {
        return Err(unauthorized_error(action));
    }
    let envelope = read_envelope(response, status, action).await?;
    if status.is_success() && envelope.success && envelope.code.unwrap_or(200) == 200 {
        return Ok(());
    }
    Err(map_failure(envelope.code, envelope.message.as_deref(), action))
}

fn network_error(action: &str, error: reqwest::Error) -> CommandError {
    CommandError::new(
        "NETWORK_ERROR",
        format!("{action}失败：无法连接服务器（{error}）"),
    )
}

/// 读取 keyring 凭据；不存在或损坏时返回 None（不向调用方暴露底层细节）。
fn load_stored_credential() -> Option<StoredCredential> {
    let entry = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER) {
        Ok(entry) => entry,
        Err(error) => {
            log::warn!("系统凭据库不可用：{error}");
            return None;
        }
    };
    match entry.get_password() {
        Ok(raw) => match serde_json::from_str::<StoredCredential>(&raw) {
            Ok(stored) if !stored.token.trim().is_empty() => Some(stored),
            Ok(_) => {
                log::warn!("系统凭据库中的 lizi 凭据缺少令牌，已忽略");
                None
            }
            Err(_) => {
                log::warn!("系统凭据库中的 lizi 凭据无法解析，已忽略");
                None
            }
        },
        Err(keyring::Error::NoEntry) => None,
        Err(error) => {
            log::warn!("读取系统凭据库失败：{error}");
            None
        }
    }
}

/// 写入 keyring（JSON 字符串内含 token/refresh token，仅本机凭据库可见）。
fn persist_credential(session: &CloudSession) -> Result<(), CommandError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| CommandError::new("KEYRING_ERROR", format!("系统凭据库不可用：{error}")))?;
    let raw = serde_json::to_string(&session.to_stored()).map_err(|error| {
        CommandError::new("KEYRING_ERROR", format!("凭据序列化失败：{error}"))
    })?;
    entry
        .set_password(&raw)
        .map_err(|error| CommandError::new("KEYRING_ERROR", format!("写入系统凭据库失败：{error}")))
}

/// 删除 keyring 条目；条目本就不存在时视为成功（登出幂等）。
fn clear_credential() -> Result<(), CommandError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|error| CommandError::new("KEYRING_ERROR", format!("系统凭据库不可用：{error}")))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(CommandError::new(
            "KEYRING_ERROR",
            format!("清除系统凭据失败：{error}"),
        )),
    }
}

/// 服务端 `userId` 有时是数字（`/me`）、有时是字符串（`/user/login`）：统一按字符串接收。
fn deserialize_stringish<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    match value {
        Value::String(text) => Ok(text),
        Value::Number(number) => Ok(number.to_string()),
        Value::Null => Ok(String::new()),
        _ => Err(serde::de::Error::custom("期望字符串或数字")),
    }
}

fn deserialize_opt_stringish<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    match value {
        Value::String(text) => Ok(Some(text)),
        Value::Number(number) => Ok(Some(number.to_string())),
        Value::Null => Ok(None),
        _ => Err(serde::de::Error::custom("期望字符串或数字")),
    }
}
