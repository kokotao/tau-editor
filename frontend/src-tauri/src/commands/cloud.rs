/**
 * @description lizi 账号登录与云文档同步的 Tauri 命令层：JWT 只在 Rust 内存与系统凭据库中流转，日志不落敏感信息
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-25 10:00
 */
use std::fs;
use std::sync::OnceLock;
use std::time::{Duration, Instant, UNIX_EPOCH};

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
/// 刷新令牌头：普通接口不得携带（否则服务端按非法请求 401），只用于落库与 `POST /user/refresh`。
const REFRESH_AUTH_HEADER: &str = "Refresh-Authorization";
/// 云文档接口前缀。
const CLOUD_DOCS_PATH: &str = "/miniProgram/cloud/docs";
/// 静默续期接口（在服务端 SecurityConfig 白名单内，不需要 access token）。
const REFRESH_PATH: &str = "/user/refresh";
/// 分享站点配置接口（分享域名 / 默认分类 / 有效期上限）。
const SHARE_CONFIG_PATH: &str = "/miniProgram/cloud/share/config";
/// 续期失败后的冷却窗口：期间并发 401 直接复用失败结果，避免刷新风暴。
const REFRESH_FAILURE_COOLDOWN: Duration = Duration::from_secs(5);
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

/// 博客分类节点。
///
/// 服务端 `category` 表走雪花 ID，`id` / `parentId` 被 `ToStringSerializer` 序列化成字符串；
/// 根节点的 `parentId` 可能是 `null` 也可能是 `0`，这里统一归一化成 `None`。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCategoryNode {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub children: Vec<CloudCategoryNode>,
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
    /// 续期串行化 + 失败冷却（single-flight：并发 401 只刷新一次，其余等待复用结果）。
    refresh_gate: Mutex<RefreshGate>,
}

/// 续期闸门状态：记录最近一次「瞬时失败」，冷却期内直接复用该失败，避免刷新风暴。
#[derive(Default)]
struct RefreshGate {
    last_failure_at: Option<Instant>,
    last_failure_message: Option<String>,
}

/// /user/refresh 响应判定（纯函数，便于单测）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefreshVerdict {
    /// 签发成功
    Refreshed,
    /// 服务端明确拒绝（登录态确已失效，应清凭据）
    Rejected,
    /// 网络/5xx/响应异常：登录态保留，按可重试错误上报
    Transient,
}

/// 是否值得为这次 401 尝试续期：只有「401 + 本地有 refresh_token」才刷新。
pub fn should_attempt_refresh(status: u16, has_refresh_token: bool) -> bool {
    status == 401 && has_refresh_token
}

/// 重试后仍是 401 说明新令牌也被拒：必须清本地凭据。
pub fn should_clear_session_after_retry(status: u16) -> bool {
    status == 401
}

/// 解析续期响应里的新令牌：新 access token 必填；refresh token 缺省时沿用旧的（服务端未轮换）。
pub fn resolve_refreshed_tokens(
    new_access: Option<String>,
    new_refresh: Option<String>,
    previous_refresh: Option<String>,
) -> Option<(String, Option<String>)> {
    let access = new_access
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())?;
    let refresh = new_refresh
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            previous_refresh
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        });
    Some((access, refresh))
}

/// 判定 `POST /user/refresh` 的响应归属：成功 / 被拒 / 瞬时失败。
///
/// `body_code` / `body_success` 取服务端统一返回体 `{success, code}`，响应体无法解析时为 None。
/// 只有「HTTP 401/403」或「body.code=401」才算被拒；5xx、响应体异常等一律视为瞬时失败，
/// 不清登录态（否则一次代理抖动就会把用户踢下线）。
pub fn classify_refresh_response(
    status: u16,
    body_code: Option<i64>,
    body_success: Option<bool>,
) -> RefreshVerdict {
    if status == 401 || status == 403 || body_code == Some(401) {
        return RefreshVerdict::Rejected;
    }
    if (200..300).contains(&status) {
        if body_success == Some(false) {
            return RefreshVerdict::Rejected;
        }
        if body_code.unwrap_or(200) == 200 {
            return RefreshVerdict::Refreshed;
        }
    }
    RefreshVerdict::Transient
}

/// 冷却期内不再发起新的续期请求（复用上次失败结果）。
pub fn cooldown_active(last_failure_at: Option<Instant>, now: Instant, cooldown: Duration) -> bool {
    match last_failure_at {
        Some(at) => now.saturating_duration_since(at) < cooldown,
        None => false,
    }
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
    let response = send_authed(&state, "获取云空间信息", |client, session| {
        authed(
            client.get(format!("{}{CLOUD_DOCS_PATH}/me", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
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

    let response = send_authed(&state, "获取云文档列表", |client, session| {
        authed(
            client.get(format!("{}{CLOUD_DOCS_PATH}", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
        .query(&query)
    })
    .await?;
    parse_result(response, "获取云文档列表").await
}

#[tauri::command]
pub async fn cloud_docs_get(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<CloudDocDetail, CommandError> {
    let response = send_authed(&state, "获取云文档详情", |client, session| {
        authed(
            client.get(format!("{}{CLOUD_DOCS_PATH}/{file_id}", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
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

    let response = send_authed(&state, "保存云文档", |client, session| {
        authed(
            client.post(format!("{}{CLOUD_DOCS_PATH}", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
        .header("X-Device-Id", device_id().as_str())
        .json(&payload)
    })
    .await?;
    parse_result(response, "保存云文档").await
}

#[tauri::command]
pub async fn cloud_docs_versions(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<Vec<CloudDocVersion>, CommandError> {
    let response = send_authed(&state, "获取云文档历史版本", |client, session| {
        authed(
            client.get(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/versions",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    parse_result(response, "获取云文档历史版本").await
}

#[tauri::command]
pub async fn cloud_docs_restore(
    state: State<'_, CloudState>,
    file_id: i64,
    version_id: i64,
) -> Result<CloudDocSaveResult, CommandError> {
    let response = send_authed(&state, "恢复云文档历史版本", |client, session| {
        authed(
            client.post(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/versions/{version_id}/restore",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
        .header("X-Device-Id", device_id().as_str())
    })
    .await?;
    parse_result(response, "恢复云文档历史版本").await
}

#[tauri::command]
pub async fn cloud_docs_delete(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<(), CommandError> {
    let response = send_authed(&state, "删除云文档", |client, session| {
        authed(
            client.delete(format!("{}{CLOUD_DOCS_PATH}/{file_id}", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
        .header("X-Device-Id", device_id().as_str())
    })
    .await?;
    parse_unit(response, "删除云文档").await
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 分享统计（查看次数 / 独立访客 / 近 N 天明细 / 最近访问）
// ---------------------------------------------------------------------------

/// 分享统计中「最近访问」的一条记录。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareVisit {
    #[serde(default)]
    pub time: Option<String>,
    #[serde(default)]
    pub ip_masked: Option<String>,
    #[serde(default)]
    pub fingerprint_short: Option<String>,
    #[serde(default)]
    pub ua: Option<String>,
    #[serde(default)]
    pub referer: Option<String>,
    #[serde(default)]
    pub is_new_visitor: bool,
}

/// 分享统计按天聚合项。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareDailyPoint {
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub views: i64,
    #[serde(default)]
    pub visitors: i64,
}

/// 分享统计整体返回。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareStats {
    #[serde(default)]
    pub share_url: Option<String>,
    #[serde(default)]
    pub total_views: i64,
    #[serde(default)]
    pub unique_visitors: i64,
    #[serde(default)]
    pub first_view_at: Option<String>,
    #[serde(default)]
    pub last_view_at: Option<String>,
    #[serde(default)]
    pub daily: Vec<CloudShareDailyPoint>,
    #[serde(default)]
    pub recent: Vec<CloudShareVisit>,
}

/// 拉取某文档的分享统计（仅 owner 可读；后端按 (userId, docId) 鉴权）。
#[tauri::command]
pub async fn cloud_docs_share_stats(
    state: State<'_, CloudState>,
    file_id: i64,
    days: Option<i64>,
) -> Result<CloudShareStats, CommandError> {
    let window = days.unwrap_or(30).clamp(1, 365);
    let response = send_authed(&state, "读取分享统计", |client, session| {
        authed(
            client.get(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/share/stats",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
        .query(&[("days", window.to_string())])
    })
    .await?;
    parse_result(response, "读取分享统计").await
}
// 云端分类管理（新建/重命名）与文档移动分类
// ---------------------------------------------------------------------------

/// 分类 CRUD 接口前缀（backend-qa 新增，鉴权接口）。
const CLOUD_CATEGORIES_PATH: &str = "/miniProgram/cloud/categories";

/// 分类写入请求体：`id` 为空表示新建，否则重命名。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudCategorySavePayload {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    /// 父分类 id：雪花 id 超过 2^53，必须按字符串透传，避免 JSON number 丢精度
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

/// 分类列表（树形，与博客分类同结构，供前端直接渲染）。
#[tauri::command]
pub async fn cloud_categories_list(
    state: State<'_, CloudState>,
) -> Result<Vec<CloudCategoryNode>, CommandError> {
    let response = send_authed(&state, "获取云端分类", |client, session| {
        authed(
            client.get(format!("{}{CLOUD_CATEGORIES_PATH}", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    let data = parse_optional_value(response, "获取云端分类").await?;
    Ok(normalize_categories(&data))
}

/// 新建分类（POST /categories）。
#[tauri::command]
pub async fn cloud_category_create(
    state: State<'_, CloudState>,
    name: String,
    parent_id: Option<String>,
) -> Result<CloudCategoryNode, CommandError> {
    let name = validate_category_name(&name)?;
    let payload = CloudCategorySavePayload {
        id: None,
        name,
        parent_id: parent_id.filter(|value| !value.trim().is_empty()),
    };
    let response = send_authed(&state, "新建分类", |client, session| {
        authed(
            client.post(format!("{}{CLOUD_CATEGORIES_PATH}", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
        .json(&payload)
    })
    .await?;
    let data = parse_optional_value(response, "新建分类").await?;
    category_node_from_value(&data)
        .ok_or_else(|| CommandError::new("SERVER_ERROR", "新建分类失败：服务端未返回分类数据"))
}

/// 重命名分类（PUT /categories/{id}，body 只带 name；同级重名返回 409）。
#[tauri::command]
pub async fn cloud_category_update(
    state: State<'_, CloudState>,
    id: String,
    name: String,
) -> Result<CloudCategoryNode, CommandError> {
    let trimmed_id = id.trim().to_string();
    if trimmed_id.is_empty() {
        return Err(CommandError::new("INVALID_ARGUMENT", "缺少分类 id"));
    }
    let name = validate_category_name(&name)?;
    #[derive(Serialize)]
    struct RenamePayload {
        name: String,
    }
    let response = send_authed(&state, "重命名分类", |client, session| {
        authed(
            client.put(format!(
                "{}{CLOUD_CATEGORIES_PATH}/{trimmed_id}",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
        .json(&RenamePayload { name: name.clone() })
    })
    .await?;
    let data = parse_optional_value(response, "重命名分类").await?;
    category_node_from_value(&data)
        .ok_or_else(|| CommandError::new("SERVER_ERROR", "重命名分类失败：服务端未返回分类数据"))
}

/// 删除分类（DELETE /categories/{id}）；有子分类或仍有文档引用时服务端返回 409。
#[tauri::command]
pub async fn cloud_category_delete(
    state: State<'_, CloudState>,
    id: String,
) -> Result<(), CommandError> {
    let trimmed_id = id.trim().to_string();
    if trimmed_id.is_empty() {
        return Err(CommandError::new("INVALID_ARGUMENT", "缺少分类 id"));
    }
    let response = send_authed(&state, "删除分类", |client, session| {
        authed(
            client.delete(format!(
                "{}{CLOUD_CATEGORIES_PATH}/{trimmed_id}",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    parse_unit(response, "删除分类").await
}

/// 分类名称校验：非空且不超过 64 字。
fn validate_category_name(raw: &str) -> Result<String, CommandError> {
    let name = raw.trim().to_string();
    if name.is_empty() {
        return Err(CommandError::new("INVALID_ARGUMENT", "分类名称不能为空"));
    }
    if name.chars().count() > 64 {
        return Err(CommandError::new("INVALID_ARGUMENT", "分类名称过长（最多 64 字）"));
    }
    Ok(name)
}
/// 把文档移动到指定分类（`category_id` 为 null 表示取消分类）。
#[tauri::command]
pub async fn cloud_docs_move_category(
    state: State<'_, CloudState>,
    file_id: i64,
    category_id: Option<String>,
) -> Result<(), CommandError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct MovePayload {
        /// 雪花 id：字符串透传，避免 JS number 精度丢失
        category_id: Option<String>,
    }
    let response = send_authed(&state, "移动文档分类", |client, session| {
        authed(
            client.put(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/category",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
        .json(&MovePayload { category_id: category_id.clone() })
    })
    .await?;
    parse_unit(response, "移动文档分类").await
}
// 二进制文档（pdf/doc/xls/ppt）上传：multipart，字节不经前端
// ---------------------------------------------------------------------------

/// 二进制文档单文件上限（与后端契约一致）。
pub const CLOUD_BINARY_MAX_BYTES: u64 = 50 * 1024 * 1024;
/// 允许在线预览/分享的二进制格式。
const BINARY_DOC_EXTENSIONS: &[&str] = &["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
/// 宏格式一律拒绝（安全策略）。
const MACRO_DOC_EXTENSIONS: &[&str] = &["docm", "xlsm", "pptm", "ppsm", "dotm", "xltm"];

/// 取小写扩展名（不含点）。
fn doc_extension(name: &str) -> String {
    name.rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// 是否是可上传的二进制文档（pdf/doc/docx/xls/xlsx/ppt/pptx）。
pub fn is_binary_doc_ext(name: &str) -> bool {
    BINARY_DOC_EXTENSIONS.contains(&doc_extension(name).as_str())
}

/// 是否是宏格式（docm/xlsm/pptm/ppsm…），这类文件直接拒绝。
pub fn is_macro_doc_ext(name: &str) -> bool {
    MACRO_DOC_EXTENSIONS.contains(&doc_extension(name).as_str())
}

/// 二进制文档上传前的本地校验：宏格式 → 扩展名 → 大小。
/// 返回 `Err(可读原因)` 时调用方直接展示给用户，不再发起上传。
pub fn validate_binary_doc(name: &str, size: u64) -> Result<(), &'static str> {
    if is_macro_doc_ext(name) {
        return Err("不支持含宏的 Office 文件（docm/xlsm/pptm），请另存为普通格式后再上传");
    }
    if !is_binary_doc_ext(name) {
        return Err("仅支持 pdf/doc/docx/xls/xlsx/ppt/pptx 文档");
    }
    if size > CLOUD_BINARY_MAX_BYTES {
        return Err("文件超过 50 MB 上限");
    }
    Ok(())
}

fn binary_doc_mime(path: &str) -> &'static str {
    match doc_extension(path).as_str() {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        _ => "application/octet-stream",
    }
}

/// 二进制文档上传结果（与文本保存结果结构一致）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBinaryUploadResult {
    pub file_id: i64,
    pub version: i32,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// 上传二进制文档（multipart）。已存在同 path 时服务端返回 409（V1 不支持覆盖）。
#[tauri::command]
pub async fn cloud_docs_binary_upload(
    state: State<'_, CloudState>,
    path: String,
    title: Option<String>,
    category: Option<String>,
    tags: Option<String>,
    local_path: String,
) -> Result<CloudBinaryUploadResult, CommandError> {
    let cloud_path = validate_cloud_doc_path(&path)
        .map_err(|issue| CommandError::new(issue.code(), issue.message()))?;
    let metadata = fs::metadata(&local_path)
        .map_err(|error| CommandError::new("IO_ERROR", format!("读取待上传文件失败：{error}")))?;
    if !metadata.is_file() {
        return Err(CommandError::new("INVALID_ARGUMENT", "待上传路径不是普通文件"));
    }
    validate_binary_doc(&local_path, metadata.len())
        .map_err(|reason| CommandError::new(binary_reason_code(&local_path), reason))?;

    let bytes = fs::read(&local_path)
        .map_err(|error| CommandError::new("IO_ERROR", format!("读取待上传文件失败：{error}")))?;
    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "document".to_string());
    let mime = binary_doc_mime(&local_path);
    let title = title.filter(|value| !value.trim().is_empty());
    let category = category.filter(|value| !value.trim().is_empty());
    let tags = tags.filter(|value| !value.trim().is_empty());

    // 401 续期会重放请求：每次重建 form（bytes 克隆一次即可）
    let build_form = || {
        let part = reqwest::multipart::Part::bytes(bytes.clone())
            .file_name(file_name.clone())
            .mime_str(mime)
            .unwrap_or_else(|_| {
                reqwest::multipart::Part::bytes(bytes.clone()).file_name(file_name.clone())
            });
        let mut form = reqwest::multipart::Form::new()
            .text("path", cloud_path.clone())
            .part("file", part);
        if let Some(value) = title.clone() {
            form = form.text("title", value);
        }
        if let Some(value) = category.clone() {
            form = form.text("category", value);
        }
        if let Some(value) = tags.clone() {
            form = form.text("tags", value);
        }
        form
    };

    let response = send_authed(&state, "上传二进制文档", |client, session| {
        authed(
            client.post(format!("{}{CLOUD_DOCS_PATH}/binary", session.base_url)),
            session,
        )
        .header("Accept", "application/json")
        .header("X-Device-Id", device_id().as_str())
        .multipart(build_form())
    })
    .await?;
    parse_result(response, "上传二进制文档").await
}

/// 本地校验失败时的错误码：宏格式 → UNSUPPORTED，其它 → FILE_TOO_LARGE / UNSUPPORTED。
fn binary_reason_code(path: &str) -> &'static str {
    if is_macro_doc_ext(path) {
        return "UNSUPPORTED";
    }
    "UNSUPPORTED"
}
// 文档内图片附件（md 相对图片同步）
// ---------------------------------------------------------------------------

/// 单张图片上限（与后端契约一致）。
pub const CLOUD_ASSET_MAX_BYTES: u64 = 20 * 1024 * 1024;
/// 允许的图片扩展名（不含点，小写）。
const ASSET_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

/// 图片魔数识别结果（比扩展名可信）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageMagic {
    Png,
    Jpeg,
    Gif,
    WebP,
}

impl ImageMagic {
    pub fn as_str(&self) -> &'static str {
        match self {
            ImageMagic::Png => "png",
            ImageMagic::Jpeg => "jpeg",
            ImageMagic::Gif => "gif",
            ImageMagic::WebP => "webp",
        }
    }
}

/// 是否为受支持的图片扩展名。
pub fn is_supported_image_ext(name: &str) -> bool {
    let ext = name
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    ASSET_IMAGE_EXTENSIONS.contains(&ext.as_str())
}

/// 从文件头识别图片类型（只检查前 12 字节）。
pub fn detect_image_magic(bytes: &[u8]) -> Option<ImageMagic> {
    if bytes.len() >= 8 && bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some(ImageMagic::Png);
    }
    if bytes.len() >= 3 && bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(ImageMagic::Jpeg);
    }
    if bytes.len() >= 6 && (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) {
        return Some(ImageMagic::Gif);
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some(ImageMagic::WebP);
    }
    None
}

/// 魔数与扩展名是否匹配（jpg/jpeg 视为同族）。
pub fn image_magic_matches_ext(magic: ImageMagic, name: &str) -> bool {
    let ext = name
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match magic {
        ImageMagic::Png => ext == "png",
        ImageMagic::Gif => ext == "gif",
        ImageMagic::WebP => ext == "webp",
        ImageMagic::Jpeg => ext == "jpg" || ext == "jpeg",
    }
}

/// 规范化图片相对路径：反斜杠转斜杠、去掉空段与 `./`，拒绝 `..`/绝对路径/盘符/控制字符。
/// 与云文档路径不同，这里允许 `./images/a.png` 这种以 `./` 开头的写法。
pub fn normalize_asset_rel_path(raw: &str) -> Result<String, CloudPathIssue> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(CloudPathIssue::Empty);
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err(CloudPathIssue::AbsolutePath);
    }
    let unified = trimmed.replace('\\', "/");
    let mut segments: Vec<&str> = Vec::new();
    for segment in unified.split('/') {
        let value = segment.trim();
        if value.is_empty() || value == "." {
            continue;
        }
        if value == ".." {
            return Err(CloudPathIssue::ParentTraversal);
        }
        segments.push(value);
    }
    if segments.is_empty() {
        return Err(CloudPathIssue::Empty);
    }
    // 其余规则（盘符/控制字符/非法字符/长度）复用云文档路径校验
    validate_cloud_doc_path(&segments.join("/"))
}

/// 把「文档所在目录 + 图片相对路径」拼成工作区内的绝对路径。
/// 拒绝越出工作区的相对路径（`..` 已在规范化阶段拒绝）。
pub fn resolve_asset_absolute_path(
    workspace_root: &str,
    document_path: &str,
    asset_rel_path: &str,
) -> Result<String, CloudPathIssue> {
    let root = workspace_root.trim();
    if root.is_empty() {
        return Err(CloudPathIssue::Empty);
    }
    let doc_dir = std::path::Path::new(document_path)
        .parent()
        .map(|value| value.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from(root));
    let rel = normalize_asset_rel_path(asset_rel_path)?;
    let joined = doc_dir.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    let root_path = std::path::Path::new(root);
    // 词法校验：拼接结果必须仍在工作区根下（不依赖文件是否存在）
    if !joined.starts_with(root_path) {
        return Err(CloudPathIssue::NotUnderWorkspace);
    }
    Ok(joined.to_string_lossy().to_string())
}

/// 本地图片源探测结果（供前端做「只传变更」比对）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAssetSourceInfo {
    pub path: String,
    pub exists: bool,
    pub size: u64,
    pub content_hash: Option<String>,
    pub supported: bool,
    /// 不可上传的原因（扩展名/超限/魔数不符/读取失败）
    pub reason: Option<String>,
}

/// 探测一批本地图片：存在性、大小、sha256、扩展名与魔数校验（不读整文件以外的额外 IO）。
#[tauri::command]
pub fn cloud_inspect_asset_sources(
    paths: Vec<String>,
) -> Result<Vec<CloudAssetSourceInfo>, CommandError> {
    let mut results = Vec::with_capacity(paths.len());
    for raw in paths {
        let path = raw.trim().to_string();
        let mut info = CloudAssetSourceInfo {
            path: path.clone(),
            exists: false,
            size: 0,
            content_hash: None,
            supported: false,
            reason: None,
        };
        if path.is_empty() {
            info.reason = Some("图片路径为空".to_string());
            results.push(info);
            continue;
        }
        let metadata = match fs::metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => {
                info.reason = Some("图片文件不存在".to_string());
                results.push(info);
                continue;
            }
        };
        if !metadata.is_file() {
            info.reason = Some("不是普通文件".to_string());
            results.push(info);
            continue;
        }
        info.exists = true;
        info.size = metadata.len();
        if !is_supported_image_ext(&path) {
            info.reason = Some("仅支持 png/jpg/jpeg/gif/webp 图片".to_string());
            results.push(info);
            continue;
        }
        if metadata.len() > CLOUD_ASSET_MAX_BYTES {
            info.reason = Some(format!(
                "图片超过 {} MB 上限",
                CLOUD_ASSET_MAX_BYTES / (1024 * 1024)
            ));
            results.push(info);
            continue;
        }
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => {
                info.reason = Some("读取图片失败".to_string());
                results.push(info);
                continue;
            }
        };
        match detect_image_magic(&bytes) {
            Some(magic) if image_magic_matches_ext(magic, &path) => {
                info.supported = true;
                info.content_hash = Some(format!("sha256:{}", sha256_hex(&bytes)));
            }
            Some(_) => {
                info.reason = Some("图片实际格式与扩展名不一致".to_string());
            }
            None => {
                info.reason = Some("不是受支持的图片格式（魔数校验失败）".to_string());
            }
        }
        results.push(info);
    }
    Ok(results)
}

/// 云文档图片附件信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAssetInfo {
    pub asset_id: i64,
    pub rel_path: String,
    pub file_name: String,
    #[serde(default)]
    pub mime: Option<String>,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub content_hash: Option<String>,
}



/// 图片下载落盘结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAssetDownloadResult {
    /// written / skippedSame / skippedConflict
    pub status: String,
    pub local_path: String,
    pub size: u64,
    pub reason: Option<String>,
}

fn asset_mime_for(path: &str) -> &'static str {
    let ext = path
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}



/// 列出文档已上传的图片附件。
#[tauri::command]
pub async fn cloud_docs_assets_list(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<Vec<CloudAssetInfo>, CommandError> {
    let response = send_authed(&state, "获取图片附件列表", |client, session| {
        authed(
            client.get(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/assets",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    parse_result(response, "获取图片附件列表").await
}

/// 上传单张本地图片（大小/扩展名/魔数在本地先校验，服务端还会做病毒扫描）。
#[tauri::command]
pub async fn cloud_docs_asset_upload_file(
    state: State<'_, CloudState>,
    file_id: i64,
    rel_path: String,
    local_path: String,
) -> Result<CloudAssetInfo, CommandError> {
    let rel_path = normalize_asset_rel_path(&rel_path)
        .map_err(|issue| CommandError::new(issue.code(), issue.message()))?;
    let metadata = fs::metadata(&local_path)
        .map_err(|error| CommandError::new("IO_ERROR", format!("读取图片失败：{error}")))?;
    if !metadata.is_file() {
        return Err(CommandError::new("INVALID_ARGUMENT", "待上传路径不是普通文件"));
    }
    if !is_supported_image_ext(&local_path) {
        return Err(CommandError::new(
            "UNSUPPORTED",
            "仅支持 png/jpg/jpeg/gif/webp 图片",
        ));
    }
    if metadata.len() > CLOUD_ASSET_MAX_BYTES {
        return Err(CommandError::new(
            "FILE_TOO_LARGE",
            format!(
                "图片超过 {} MB 上限",
                CLOUD_ASSET_MAX_BYTES / (1024 * 1024)
            ),
        ));
    }
    let bytes = fs::read(&local_path)
        .map_err(|error| CommandError::new("IO_ERROR", format!("读取图片失败：{error}")))?;
    match detect_image_magic(&bytes) {
        Some(magic) if image_magic_matches_ext(magic, &local_path) => {}
        Some(_) => {
            return Err(CommandError::new(
                "UNSUPPORTED",
                "图片实际格式与扩展名不一致，已跳过上传",
            ))
        }
        None => {
            return Err(CommandError::new(
                "UNSUPPORTED",
                "文件不是受支持的图片格式（魔数校验失败），已跳过上传",
            ))
        }
    }

    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| rel_path.clone());
    let mime = asset_mime_for(&local_path);
    // 后端是 multipart/form-data（@RequestParam relPath/fileName/mime + MultipartFile file）：
    // 401 续期会重放请求，因此每次重建 form（bytes 克隆一次）。
    let build_form = || {
        let part = reqwest::multipart::Part::bytes(bytes.clone())
            .file_name(file_name.clone())
            .mime_str(mime)
            .unwrap_or_else(|_| {
                reqwest::multipart::Part::bytes(bytes.clone()).file_name(file_name.clone())
            });
        reqwest::multipart::Form::new()
            .text("relPath", rel_path.clone())
            .text("fileName", file_name.clone())
            .text("mime", mime.to_string())
            .part("file", part)
    };
    let response = send_authed(&state, "上传图片附件", |client, session| {
        authed(
            client.post(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/assets",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
        .multipart(build_form())
    })
    .await?;
    parse_result(response, "上传图片附件").await
}

/// 下载云端图片并写入 workspace 对应相对路径。
/// 已存在且内容一致 → skippedSame；存在但不同 → skippedConflict（不覆盖用户文件）。
#[tauri::command]
pub async fn cloud_docs_asset_download(
    state: State<'_, CloudState>,
    file_id: i64,
    asset_id: i64,
    workspace_root: String,
    document_path: String,
    rel_path: String,
    expected_hash: Option<String>,
) -> Result<CloudAssetDownloadResult, CommandError> {
    let absolute = resolve_asset_absolute_path(&workspace_root, &document_path, &rel_path)
        .map_err(|issue| CommandError::new(issue.code(), issue.message()))?;
    let target = std::path::Path::new(&absolute);

    if target.exists() {
        let existing = fs::read(target)
            .map_err(|error| CommandError::new("IO_ERROR", format!("读取本地图片失败：{error}")))?;
        let local_hash = format!("sha256:{}", sha256_hex(&existing));
        let same = match expected_hash.as_deref().map(str::trim) {
            Some(expected) if !expected.is_empty() => {
                normalize_remote_hash(Some(expected)).as_deref() == Some(local_hash.as_str())
            }
            _ => false,
        };
        if same {
            return Ok(CloudAssetDownloadResult {
                status: "skippedSame".to_string(),
                local_path: absolute,
                size: existing.len() as u64,
                reason: None,
            });
        }
        return Ok(CloudAssetDownloadResult {
            status: "skippedConflict".to_string(),
            local_path: absolute,
            size: existing.len() as u64,
            reason: Some("本地已有同名图片但内容不同，未覆盖".to_string()),
        });
    }

    let response = send_authed(&state, "下载图片附件", |client, session| {
        authed(
            client.get(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/assets/{asset_id}",
                session.base_url
            )),
            session,
        )
    })
    .await?;
    let status = response.status();
    if !status.is_success() {
        return Err(CommandError::new(
            if status == StatusCode::NOT_FOUND { "NOT_FOUND" } else { "SERVER_ERROR" },
            format!("下载图片附件失败（HTTP {}）", status.as_u16()),
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| network_error("下载图片附件", error))?;
    if bytes.len() as u64 > CLOUD_ASSET_MAX_BYTES {
        return Err(CommandError::new(
            "FILE_TOO_LARGE",
            "云端图片超过本地单张上限，已跳过",
        ));
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| CommandError::new("IO_ERROR", format!("创建目录失败：{error}")))?;
    }
    fs::write(target, &bytes)
        .map_err(|error| CommandError::new("IO_ERROR", format!("写入图片失败：{error}")))?;
    Ok(CloudAssetDownloadResult {
        status: "written".to_string(),
        local_path: absolute,
        size: bytes.len() as u64,
        reason: None,
    })
}
// 一键分享（生成/查询/撤销分享链接）
// ---------------------------------------------------------------------------

/// 分享创建请求体；`regenerate` 为 false 时服务端复用已有链接。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareCreatePayload {
    pub regenerate: bool,
    #[serde(default)]
    pub expires_in_days: Option<i32>,
    #[serde(default)]
    pub password: Option<String>,
}

/// 分享信息（创建/查询共用；查询时大部分字段可能为空）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareInfo {
    pub share_url: String,
    pub token: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub has_password: bool,
    #[serde(default)]
    pub visit_count: i64,
    #[serde(default)]
    pub synced_version: Option<i32>,
    #[serde(default)]
    pub category_applied: Option<String>,
    #[serde(default)]
    pub applied_default_category: Option<bool>,
    /// 文件扩展名（不含点，小写），分享页据此选择渲染器
    #[serde(default)]
    pub file_ext: Option<String>,
    /// 渲染类型：markdown / code / text / image / pdf / office / other
    #[serde(default)]
    pub file_kind: Option<String>,
    #[serde(default)]
    pub file_name: Option<String>,
}

/// 分享状态查询结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareStatus {
    pub shared: bool,
    #[serde(default)]
    pub share_url: Option<String>,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub has_password: Option<bool>,
    #[serde(default)]
    pub visit_count: Option<i64>,
    #[serde(default)]
    pub file_ext: Option<String>,
    #[serde(default)]
    pub file_kind: Option<String>,
    #[serde(default)]
    pub file_name: Option<String>,
}

/// 分享站点配置：分享域名、默认分类、有效期上限；取不到时前端有兜底。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudShareConfig {
    #[serde(default)]
    pub share_base_url: Option<String>,
    #[serde(default)]
    pub default_category: Option<String>,
    #[serde(default)]
    pub max_expire_days: Option<i32>,
}

/// 生成（或复用）云文档分享链接。
#[tauri::command]
pub async fn cloud_docs_share_create(
    state: State<'_, CloudState>,
    file_id: i64,
    regenerate: Option<bool>,
    expires_in_days: Option<i32>,
    password: Option<String>,
) -> Result<CloudShareInfo, CommandError> {
    let payload = CloudShareCreatePayload {
        regenerate: regenerate.unwrap_or(false),
        expires_in_days: expires_in_days.filter(|days| *days > 0),
        password: password
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    };
    let response = send_authed(&state, "生成分享链接", |client, session| {
        authed(
            client.post(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/share",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
        .json(&payload)
    })
    .await?;
    parse_result(response, "生成分享链接").await
}

/// 查询云文档当前的分享状态。
#[tauri::command]
pub async fn cloud_docs_share_status(
    state: State<'_, CloudState>,    file_id: i64,
) -> Result<CloudShareStatus, CommandError> {
    let response = send_authed(&state, "获取分享状态", |client, session| {
        authed(
            client.get(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/share",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    parse_result(response, "获取分享状态").await
}

/// 撤销分享：旧链接立即失效。
#[tauri::command]
pub async fn cloud_docs_share_revoke(
    state: State<'_, CloudState>,
    file_id: i64,
) -> Result<(), CommandError> {
    let response = send_authed(&state, "撤销分享", |client, session| {
        authed(
            client.post(format!(
                "{}{CLOUD_DOCS_PATH}/{file_id}/share/revoke",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    parse_unit(response, "撤销分享").await
}

/// 分享站点配置（分享域名 / 默认分类 / 有效期上限）。
#[tauri::command]
pub async fn cloud_share_config(
    state: State<'_, CloudState>,
) -> Result<CloudShareConfig, CommandError> {
    let response = send_authed(&state, "获取分享配置", |client, session| {
        authed(
            client.get(format!(
                "{}{SHARE_CONFIG_PATH}",
                session.base_url
            )),
            session,
        )
        .header("Accept", "application/json")
    })
    .await?;
    parse_result(response, "获取分享配置").await
}

/// 博客分类树。
///
/// 服务端 `GET /blog/pages/categories` 是公开接口（SecurityConfig PUBLIC_PATHS 含 `/blog/pages/**`），
/// 因此不携带令牌：避免本地已过期 token 反而被 JWT filter 判成 401。
/// 返回值有两种形态，这里统一归一化成树：
/// - `category` 表有数据：`Category` 实体树（id/name/parentId/children）；
/// - `category` 表为空：文章表去重后的分类名数组（纯字符串），以分类名同时充当 id/name。
#[tauri::command]
pub async fn cloud_blog_categories(
    state: State<'_, CloudState>,
) -> Result<Vec<CloudCategoryNode>, CommandError> {
    let base_url = resolve_base_url(&state).await;
    let client = http_client()?;
    let response = client
        .get(format!("{base_url}/blog/pages/categories"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| network_error("获取博客分类", error))?;
    let data = parse_optional_value(response, "获取博客分类").await?;
    Ok(normalize_categories(&data))
}

/// 博客标签。
///
/// 服务端 `GET /blog/pages/tags` 同样是公开接口，返回 `Set<String>`（无序、已按中英文逗号拆分）。
/// 这里去重并排序，保证前端每次拿到的顺序稳定。
#[tauri::command]
pub async fn cloud_blog_tags(state: State<'_, CloudState>) -> Result<Vec<String>, CommandError> {
    let base_url = resolve_base_url(&state).await;
    let client = http_client()?;
    let response = client
        .get(format!("{base_url}/blog/pages/tags"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| network_error("获取博客标签", error))?;
    let data = parse_optional_value(response, "获取博客标签").await?;
    Ok(normalize_tags(&data))
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

/// 公开接口用的 base_url：优先当前会话，其次 keyring 里上次登录的地址，最后回默认值。
async fn resolve_base_url(state: &CloudState) -> String {
    {
        let cached = state.session.lock().await;
        if let Some(session) = cached.as_ref() {
            return session.base_url.clone();
        }
    }
    if let Some(stored) = load_stored_credential() {
        return stored.base_url;
    }
    DEFAULT_BASE_URL.to_string()
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

/// 一次续期请求的结果分类。
enum RefreshOutcome {
    /// 拿到了新的 access token（可能同时轮换了 refresh token）
    Renewed(CloudSession),
    /// 服务端明确拒绝：本地登录态已失效
    Rejected,
    /// 网络/服务端异常：保留登录态，按可重试错误上报
    Transient(String),
}

/// 调用 `POST /user/refresh` 换新令牌。
/// 只带 `Refresh-Authorization`：过期的 access token 不参与鉴权（否则服务端会先判 401）。
async fn request_refresh(
    client: &Client,
    session: &CloudSession,
    refresh_token: &str,
) -> RefreshOutcome {
    let response = match client
        .post(format!("{}{REFRESH_PATH}", session.base_url))
        .header(REFRESH_AUTH_HEADER, refresh_token)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return RefreshOutcome::Transient(format!(
                "刷新登录状态失败：无法连接服务器（{error}）"
            ))
        }
    };

    // 响应头与响应体都要先取出，再决定归属（header_value 需在消费 body 前调用）。
    let status = response.status();
    let new_access = header_value(&response, AUTH_HEADER);
    let new_refresh = header_value(&response, REFRESH_AUTH_HEADER);
    let body = response.text().await.unwrap_or_default();
    let envelope = serde_json::from_str::<ApiEnvelope>(&body).ok();
    let verdict = classify_refresh_response(
        status.as_u16(),
        envelope.as_ref().and_then(|item| item.code),
        envelope.as_ref().map(|item| item.success),
    );

    match verdict {
        RefreshVerdict::Rejected => RefreshOutcome::Rejected,
        RefreshVerdict::Transient => RefreshOutcome::Transient(format!(
            "刷新登录状态失败：服务端返回异常（HTTP {}）",
            status.as_u16()
        )),
        RefreshVerdict::Refreshed => {
            match resolve_refreshed_tokens(new_access, new_refresh, session.refresh_token.clone())
            {
                Some((token, refresh_token)) => RefreshOutcome::Renewed(CloudSession {
                    token,
                    refresh_token,
                    base_url: session.base_url.clone(),
                    user_id: session.user_id.clone(),
                    username: session.username.clone(),
                }),
                // 200 却没有新令牌：契约不满足，按瞬时失败处理，避免误清登录态。
                None => RefreshOutcome::Transient(
                    "刷新登录状态失败：响应缺少新的访问令牌".to_string(),
                ),
            }
        }
    }
}

/// single-flight 续期：并发 401 时只有第一个请求真正调 `/user/refresh`，
/// 其余在锁上等待、醒来后发现令牌已被换掉就直接复用，避免刷新风暴与轮换踩踏。
///
/// 返回 `Ok(Some(session))` 表示已有可用新令牌；`Ok(None)` 表示本地没有 refresh_token
/// （调用方保持原有 401 行为）；`Err` 表示确实续不上（UNAUTHORIZED）或暂时性失败（NETWORK_ERROR）。
async fn refresh_session_single_flight(
    state: &CloudState,
    client: &Client,
    used_session: &CloudSession,
    action: &str,
) -> Result<Option<CloudSession>, CommandError> {
    // 快路径：别人已经换好了，直接复用。
    {
        let cached = state.session.lock().await;
        if let Some(current) = cached.as_ref() {
            if current.token != used_session.token {
                return Ok(Some(current.clone()));
            }
        }
    }

    // 串行化：同一时刻只有一个刷新在飞。
    let mut gate = state.refresh_gate.lock().await;

    let current = state.session.lock().await.clone();
    let Some(current) = current else {
        // 等待期间会话被登出/清空
        return Err(unauthorized_error(action));
    };
    if current.token != used_session.token {
        // 排队期间别人刷新成功：直接复用
        return Ok(Some(current));
    }
    let Some(refresh_token) = current
        .refresh_token
        .clone()
        .filter(|value| !value.trim().is_empty())
    else {
        return Ok(None);
    };
    if cooldown_active(gate.last_failure_at, Instant::now(), REFRESH_FAILURE_COOLDOWN) {
        // 刚失败过：复用失败结果，别让并发 401 串行重复打刷新接口
        return Err(CommandError::new(
            "NETWORK_ERROR",
            gate.last_failure_message
                .clone()
                .unwrap_or_else(|| "刷新登录状态失败，请稍后重试".to_string()),
        ));
    }

    match request_refresh(client, &current, &refresh_token).await {
        RefreshOutcome::Renewed(renewed) => {
            gate.last_failure_at = None;
            gate.last_failure_message = None;
            *state.session.lock().await = Some(renewed.clone());
            // keyring 写失败不影响本次会话（下次启动需重新登录），只告警。
            if let Err(error) = persist_credential(&renewed) {
                log::warn!("lizi 凭据续期后未能写入系统凭据库：{}", error.message);
            }
            log::info!("lizi 云文档登录状态已静默续期");
            Ok(Some(renewed))
        }
        RefreshOutcome::Rejected => {
            gate.last_failure_at = None;
            gate.last_failure_message = None;
            *state.session.lock().await = None;
            // 清 keyring 失败也不能把「登录态已失效」的判定翻过来
            if let Err(error) = clear_credential() {
                log::warn!("刷新令牌被拒后清除 lizi 凭据失败：{}", error.message);
            }
            log::warn!("lizi 刷新令牌被拒绝，已清除本地登录态");
            Err(unauthorized_error(action))
        }
        RefreshOutcome::Transient(message) => {
            gate.last_failure_at = Some(Instant::now());
            gate.last_failure_message = Some(message.clone());
            Err(CommandError::new("NETWORK_ERROR", message))
        }
    }
}

/// 带令牌发请求 + 401 静默续期（最多重试一次）。
///
/// 401 且本地有 refresh_token 时：续期 → 用新令牌重试一次；重试仍 401 说明会话确已失效，
/// 清凭据并返回 UNAUTHORIZED。没有 refresh_token、或续期是暂时性失败时保持原有行为。
async fn send_authed<F>(
    state: &CloudState,
    action: &str,
    build: F,
) -> Result<Response, CommandError>
where
    F: Fn(&Client, &CloudSession) -> RequestBuilder,
{
    let client = http_client()?;
    let session = current_session(state).await?;
    let response = build(&client, &session)
        .send()
        .await
        .map_err(|error| network_error(action, error))?;

    if !should_attempt_refresh(
        response.status().as_u16(),
        session.refresh_token.is_some(),
    ) {
        return Ok(response);
    }

    let Some(renewed) = refresh_session_single_flight(state, &client, &session, action).await?
    else {
        // 没有 refresh_token：维持原有 401 行为，交给 parse_result 归一化
        return Ok(response);
    };

    let retried = build(&client, &renewed)
        .send()
        .await
        .map_err(|error| network_error(action, error))?;
    if should_clear_session_after_retry(retried.status().as_u16()) {
        *state.session.lock().await = None;
        if let Err(error) = clear_credential() {
            log::warn!("续期后仍 401，清除 lizi 凭据失败：{}", error.message);
        }
        return Err(unauthorized_error(action));
    }
    Ok(retried)
}

// ---------------------------------------------------------------------------
// 云端文档浏览器：路径落点与「能否打开」判定（纯函数 + 单次本地探测命令）
// ---------------------------------------------------------------------------

/// 打开云端文档时本机落点的最大文件体积（与 `cloud_read_sync_source` 的上传上限保持一致）。
pub const CLOUD_OPEN_MAX_BYTES: u64 = 12 * 1024 * 1024;

/// 云路径校验失败的原因：与后端 `CloudDocPathValidator` 的规则对齐，
/// 文案由这里统一给出，避免前后端各写一份。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CloudPathIssue {
    Empty,
    AbsolutePath,
    DriveLetter,
    ParentTraversal,
    ControlChar,
    IllegalChar,
    TooLong,
    TooManySegments,
    NotUnderWorkspace,
}

impl CloudPathIssue {
    /// 稳定的错误码，前端可用于分支判断。
    pub fn code(&self) -> &'static str {
        match self {
            CloudPathIssue::Empty => "CLOUD_PATH_EMPTY",
            CloudPathIssue::AbsolutePath => "CLOUD_PATH_ABSOLUTE",
            CloudPathIssue::DriveLetter => "CLOUD_PATH_DRIVE",
            CloudPathIssue::ParentTraversal => "CLOUD_PATH_TRAVERSAL",
            CloudPathIssue::ControlChar => "CLOUD_PATH_CONTROL_CHAR",
            CloudPathIssue::IllegalChar => "CLOUD_PATH_ILLEGAL_CHAR",
            CloudPathIssue::TooLong => "CLOUD_PATH_TOO_LONG",
            CloudPathIssue::TooManySegments => "CLOUD_PATH_TOO_DEEP",
            CloudPathIssue::NotUnderWorkspace => "CLOUD_PATH_NOT_IN_WORKSPACE",
        }
    }

    /// 可读中文提示（直接展示给用户）。
    pub fn message(&self) -> &'static str {
        match self {
            CloudPathIssue::Empty => "云文档路径不能为空",
            CloudPathIssue::AbsolutePath => "云文档路径不能是绝对路径",
            CloudPathIssue::DriveLetter => "云文档路径不能包含盘符",
            CloudPathIssue::ParentTraversal => "云文档路径不能包含 .. 或 . 段",
            CloudPathIssue::ControlChar => "云文档路径不能包含控制字符",
            CloudPathIssue::IllegalChar => "云文档路径不能包含 :*?\"<>| 等字符",
            CloudPathIssue::TooLong => "云文档路径过长",
            CloudPathIssue::TooManySegments => "云文档路径层级过深",
            CloudPathIssue::NotUnderWorkspace => "该云文档不属于当前工作区，无法落到本地",
        }
    }
}

/// 规范化并校验云文档路径：反斜杠转正斜杠、折叠重复分隔符、去掉首尾斜杠，
/// 拒绝空路径 / 绝对路径 / 盘符 / `.`、`..` 段 / 控制字符 / Windows 非法字符 / 超长。
pub fn validate_cloud_doc_path(raw: &str) -> Result<String, CloudPathIssue> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(CloudPathIssue::Empty);
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') {
        return Err(CloudPathIssue::AbsolutePath);
    }
    if trimmed.chars().any(|ch| ch.is_control()) {
        return Err(CloudPathIssue::ControlChar);
    }
    let bytes = trimmed.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        return Err(CloudPathIssue::DriveLetter);
    }
    if trimmed.chars().any(|ch| ":*?\"<>|".contains(ch)) {
        return Err(CloudPathIssue::IllegalChar);
    }

    let mut segments: Vec<&str> = Vec::new();
    let unified = trimmed.replace('\\', "/");
    for segment in unified.split('/') {
        let segment = segment.trim();
        if segment.is_empty() || segment == "." || segment == ".." {
            if segment == "." || segment == ".." {
                return Err(CloudPathIssue::ParentTraversal);
            }
            continue;
        }
        segments.push(segment);
    }
    if segments.is_empty() {
        return Err(CloudPathIssue::Empty);
    }
    if segments.len() > 32 {
        return Err(CloudPathIssue::TooManySegments);
    }
    let normalized = segments.join("/");
    if normalized.chars().count() > 512 {
        return Err(CloudPathIssue::TooLong);
    }
    Ok(normalized)
}

/// 把 `tau/{workspace}/{relative}` 还原成工作区内的相对路径。
/// 只接受属于当前工作区的云文档，避免把别的文档写到工作区里。
pub fn cloud_path_to_workspace_relative(
    cloud_path: &str,
    workspace_name: &str,
) -> Result<String, CloudPathIssue> {
    let normalized = validate_cloud_doc_path(cloud_path)?;
    let normalized_workspace = workspace_name
        .replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/");

    let prefix = if normalized_workspace.is_empty() {
        "tau/".to_string()
    } else {
        format!("tau/{normalized_workspace}/")
    };
    // 只给了工作区目录本身（例如 tau/ws/）：不是文件，按空路径拒绝
    if normalized == prefix.trim_end_matches('/') {
        return Err(CloudPathIssue::Empty);
    }
    let relative = normalized
        .strip_prefix(prefix.as_str())
        .ok_or(CloudPathIssue::NotUnderWorkspace)?;
    if relative.is_empty() {
        return Err(CloudPathIssue::Empty);
    }
    Ok(relative.to_string())
}

/// 云端文档是否是可安全打开的文本文件：扩展名白名单与后端 `CloudDocPathValidator` 一致。
pub fn is_openable_text_path(path: &str) -> bool {
    let file_name = path
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .to_string();
    let Some((stem, extension)) = file_name.rsplit_once('.') else {
        // 无扩展名的纯文本（README / LICENSE 等）按后端白名单里的 gitignore/env 规则处理不了，
        // 这里保持一致：必须带扩展名。
        return false;
    };
    if stem.is_empty() {
        return false;
    }
    const TEXT_EXTENSIONS: &[&str] = &[
        "md", "markdown", "mdx", "txt", "json", "yaml", "yml", "toml", "ini", "conf", "properties",
        "js", "jsx", "mjs", "cjs", "ts", "tsx", "vue", "py", "java", "kt", "go", "rs", "c", "h",
        "cc", "cpp", "hpp", "cs", "php", "rb", "sh", "bash", "zsh", "bat", "ps1", "html", "htm",
        "css", "scss", "sass", "less", "xml", "sql", "log", "csv", "tex", "gradle", "gitignore",
        "env", "cfg",
    ];
    TEXT_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
}

/// 打开云端文档的动作决策（纯函数，便于单测）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloudOpenAction {
    /// 本地已有且内容与云端一致：直接打开对应标签
    OpenExisting,
    /// 本地没有：拉内容落盘后打开
    WriteAndOpen,
    /// 本地已有但内容不同：必须先让用户确认（覆盖 / 另存为 / 取消）
    ConfirmOverwrite,
    /// 不可打开（二进制 / 非白名单扩展名 / 超限）
    Rejected,
}

impl CloudOpenAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            CloudOpenAction::OpenExisting => "openExisting",
            CloudOpenAction::WriteAndOpen => "writeAndOpen",
            CloudOpenAction::ConfirmOverwrite => "confirmOverwrite",
            CloudOpenAction::Rejected => "rejected",
        }
    }
}

/// 根据「扩展名是否在白名单 / 本地是否存在 / 内容哈希是否一致」决定下一步动作。
pub fn decide_cloud_open_action(
    openable: bool,
    local_exists: bool,
    same_content: bool,
) -> CloudOpenAction {
    if !openable {
        return CloudOpenAction::Rejected;
    }
    if local_exists {
        return if same_content {
            CloudOpenAction::OpenExisting
        } else {
            CloudOpenAction::ConfirmOverwrite
        };
    }
    CloudOpenAction::WriteAndOpen
}

/// 云端文档在本机的落点与打开方式。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDocOpenTarget {
    pub cloud_path: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub exists: bool,
    pub same_content: bool,
    pub openable: bool,
    /// `openExisting` / `writeAndOpen` / `confirmOverwrite` / `rejected`
    pub action: String,
    /// 不可打开时的错误码（前端据此选文案）
    pub reason_code: Option<String>,
    pub reason: Option<String>,
}

/// 判断某条云文档应当「直接打开 / 落盘后打开 / 先确认 / 拒绝」，并给出本地绝对路径。
///
/// 只做一次本地探测（metadata + 可选读取哈希），不产生任何云端请求。
#[tauri::command]
pub async fn cloud_doc_open_target(
    workspace_root: String,
    workspace_name: String,
    cloud_path: String,
    remote_hash: Option<String>,
) -> Result<CloudDocOpenTarget, CommandError> {
    let workspace_root = workspace_root.trim().to_string();
    if workspace_root.is_empty() {
        return Err(CommandError::new(
            "INVALID_ARGUMENT",
            "请先打开一个工作区，云文档需要落到工作区里",
        ));
    }

    let relative = cloud_path_to_workspace_relative(&cloud_path, &workspace_name).map_err(|issue| {
        CommandError::new(issue.code(), issue.message())
    })?;
    let absolute = std::path::Path::new(&workspace_root)
        .join(relative.replace('/', std::path::MAIN_SEPARATOR_STR))
        .to_string_lossy()
        .to_string();

    let normalized_cloud = validate_cloud_doc_path(&cloud_path)
        .map_err(|issue| CommandError::new(issue.code(), issue.message()))?;

    let mut openable = is_openable_text_path(&absolute);
    let mut reason_code: Option<String> = None;
    let mut reason: Option<String> = None;
    if !openable {
        reason_code = Some("BINARY_FILE".to_string());
        reason = Some("该云端文档不是白名单内的文本文件，暂不支持在 Tau 中打开".to_string());
    }

    let metadata = fs::metadata(&absolute).ok();
    let exists = metadata.as_ref().map(|item| item.is_file()).unwrap_or(false);

    let mut same_content = false;
    if exists && openable {
        let size = metadata.as_ref().map(|item| item.len()).unwrap_or(0);
        if size > CLOUD_OPEN_MAX_BYTES {
            openable = false;
            reason_code = Some("FILE_TOO_LARGE".to_string());
            reason = Some(format!(
                "本地同名文件超过 {} MB，暂不支持在 Tau 中打开",
                CLOUD_OPEN_MAX_BYTES / (1024 * 1024)
            ));
        } else {
            match fs::read(&absolute) {
                Ok(bytes) => match String::from_utf8(bytes) {
                    // 只有拿到云端哈希且算出的一致才算「已同步」；哈希缺失时按不一致处理，走确认流程。
                    Ok(text) => {
                        same_content = match normalize_remote_hash(remote_hash.as_deref()) {
                            Some(expected) => {
                                format!("sha256:{}", sha256_hex(text.as_bytes())) == expected
                            }
                            None => false,
                        };
                    }
                    // 本地同名文件不是 UTF-8：不能按「一致」处理，走确认流程
                    Err(_) => same_content = false,
                },
                Err(_) => same_content = false,
            }
        }
    }

    let action = decide_cloud_open_action(openable, exists, same_content);
    if action == CloudOpenAction::Rejected && reason_code.is_none() {
        reason_code = Some("BINARY_FILE".to_string());
        reason = Some("该云端文档暂不支持在 Tau 中打开".to_string());
    }

    Ok(CloudDocOpenTarget {
        cloud_path: normalized_cloud,
        relative_path: relative,
        absolute_path: absolute,
        exists,
        same_content,
        openable,
        action: action.as_str().to_string(),
        reason_code,
        reason,
    })
}

/// 云端返回的 contentHash 可能带也可能不带 `sha256:` 前缀，统一成小写带前缀形式。
fn normalize_remote_hash(raw: Option<&str>) -> Option<String> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    let hex = lower.strip_prefix("sha256:").unwrap_or(&lower).to_string();
    Some(format!("sha256:{hex}"))
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
        // 无权限（分类/文档不属于当前用户等）
        Some(403) => CommandError::new(
            "FORBIDDEN",
            detail.unwrap_or_else(|| "没有权限执行该操作".to_string()),
        ),
        Some(404) => CommandError::new(
            "NOT_FOUND",
            detail.unwrap_or_else(|| "目标不存在或已被删除".to_string()),
        ),
        // 病毒扫描未通过 / 文件不可在线预览
        Some(422) => CommandError::new(
            "UNSUPPORTED",
            detail.unwrap_or_else(|| "文件未通过云端安全检查，无法上传或预览".to_string()),
        ),
        // 安全检查服务不可用（ClamAV 503）：可重试
        Some(503) => CommandError::new(
            "SECURITY_UNAVAILABLE",
            detail.unwrap_or_else(|| "云端安全检查暂不可用，请稍后重试".to_string()),
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

/// 只读公开接口：校验 success/code 后返回原始 data，并允许 data 为 null（由调用方归一化成空集合）。
async fn parse_optional_value(response: Response, action: &str) -> Result<Value, CommandError> {
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED {
        return Err(unauthorized_error(action));
    }
    let envelope = read_envelope(response, status, action).await?;
    if status.is_success() && envelope.success && envelope.code.unwrap_or(200) == 200 {
        return Ok(envelope.data.unwrap_or(Value::Null));
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

/// 把分类返回值归一化成树；`null`/非数组都退化成空树，不让前端需要区分两种形态。
fn normalize_categories(data: &Value) -> Vec<CloudCategoryNode> {
    let items = match data {
        Value::Array(items) => items,
        Value::Null => return Vec::new(),
        // 兜底：万一服务端只返回单个对象，也当作一个根节点。
        other => return category_node_from_value(other).into_iter().collect(),
    };
    items.iter().filter_map(category_node_from_value).collect()
}

fn category_node_from_value(value: &Value) -> Option<CloudCategoryNode> {
    match value {
        // 回退形态：只有分类名，没有 ID/层级。
        Value::String(name) => {
            let name = name.trim();
            if name.is_empty() {
                return None;
            }
            Some(CloudCategoryNode {
                id: name.to_string(),
                name: name.to_string(),
                parent_id: None,
                children: Vec::new(),
            })
        }
        Value::Object(map) => {
            let name = map.get("name").and_then(jsonish_string)?;
            let id = map
                .get("id")
                .and_then(jsonish_string)
                .unwrap_or_else(|| name.clone());
            let children = map
                .get("children")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(category_node_from_value).collect())
                .unwrap_or_default();
            Some(CloudCategoryNode {
                id,
                name,
                parent_id: map
                    .get("parentId")
                    .and_then(jsonish_string)
                    .and_then(normalize_parent_id),
                children,
            })
        }
        _ => None,
    }
}

/// 根节点的 `parentId` 可能是 `null` / `0` / `"0"`，统一成 `None`。
fn normalize_parent_id(raw: String) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "0" {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// 把标签返回值归一化成去重、有序的字符串列表；同时兼容未来可能出现的对象形态。
fn normalize_tags(data: &Value) -> Vec<String> {
    let items = match data {
        Value::Array(items) => items,
        Value::Null => return Vec::new(),
        other => std::slice::from_ref(other),
    };
    let mut tags: Vec<String> = items.iter().filter_map(tag_from_value).collect();
    tags.sort();
    tags.dedup();
    tags
}

fn tag_from_value(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Object(map) => ["name", "tag", "tagName", "label", "title"]
            .iter()
            .find_map(|key| map.get(*key).and_then(jsonish_string)),
        _ => None,
    }
}

/// 服务端 ID / 名称字段既可能是 JSON 字符串（雪花 ID 用 ToStringSerializer）也可能是数字。
fn jsonish_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Value::Number(number) => Some(number.to_string()),
        _ => None,
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

#[cfg(test)]
mod tests {
    use super::{
        classify_refresh_response, cooldown_active, resolve_refreshed_tokens,
        should_attempt_refresh, should_clear_session_after_retry, RefreshVerdict,
        REFRESH_FAILURE_COOLDOWN,
    };
    use std::time::{Duration, Instant};

    #[test]
    fn 只有401且本地有刷新令牌才续期() {
        assert!(should_attempt_refresh(401, true));
        // 没有 refresh_token：保持原有 401 行为
        assert!(!should_attempt_refresh(401, false));
        // 其它状态码不触发续期（403 不当作可续期的过期）
        assert!(!should_attempt_refresh(200, true));
        assert!(!should_attempt_refresh(403, true));
        assert!(!should_attempt_refresh(409, true));
    }

    #[test]
    fn 重试后仍401才清会话() {
        assert!(should_clear_session_after_retry(401));
        assert!(!should_clear_session_after_retry(200));
        assert!(!should_clear_session_after_retry(409));
        assert!(!should_clear_session_after_retry(413));
    }

    #[test]
    fn 续期响应应同时取到新access与轮换后的refresh() {
        let resolved = resolve_refreshed_tokens(
            Some("new-access".to_string()),
            Some("new-refresh".to_string()),
            Some("old-refresh".to_string()),
        );
        assert_eq!(
            resolved,
            Some(("new-access".to_string(), Some("new-refresh".to_string())))
        );
    }

    #[test]
    fn 服务端未轮换时沿用旧refresh令牌() {
        let resolved = resolve_refreshed_tokens(
            Some(" new-access ".to_string()),
            None,
            Some("old-refresh".to_string()),
        );
        assert_eq!(
            resolved,
            Some(("new-access".to_string(), Some("old-refresh".to_string())))
        );

        // 新 refresh 头是空串时同样沿用旧的
        let blank_refresh = resolve_refreshed_tokens(
            Some("new-access".to_string()),
            Some("   ".to_string()),
            Some("old-refresh".to_string()),
        );
        assert_eq!(
            blank_refresh,
            Some(("new-access".to_string(), Some("old-refresh".to_string())))
        );
    }

    #[test]
    fn 缺少新access令牌视为解析失败() {
        assert_eq!(resolve_refreshed_tokens(None, Some("r".to_string()), None), None);
        assert_eq!(
            resolve_refreshed_tokens(Some("  ".to_string()), Some("r".to_string()), None),
            None
        );
        // 也没有旧 refresh 时，refresh 位为 None
        assert_eq!(
            resolve_refreshed_tokens(Some("a".to_string()), None, None),
            Some(("a".to_string(), None))
        );
    }

    #[test]
    fn 续期响应判定区分成功被拒与瞬时失败() {
        // 契约成功：HTTP200 + {success:true, code:200}
        assert_eq!(
            classify_refresh_response(200, Some(200), Some(true)),
            RefreshVerdict::Refreshed
        );
        // code 缺省按 200 处理
        assert_eq!(
            classify_refresh_response(200, None, Some(true)),
            RefreshVerdict::Refreshed
        );
        // 被拒：HTTP 401/403 或 body.code=401
        assert_eq!(
            classify_refresh_response(401, None, None),
            RefreshVerdict::Rejected
        );
        assert_eq!(
            classify_refresh_response(403, None, None),
            RefreshVerdict::Rejected
        );
        assert_eq!(
            classify_refresh_response(200, Some(401), Some(false)),
            RefreshVerdict::Rejected
        );
        assert_eq!(
            classify_refresh_response(200, Some(500), Some(false)),
            RefreshVerdict::Rejected
        );
        // 瞬时失败：不清登录态
        assert_eq!(
            classify_refresh_response(500, None, None),
            RefreshVerdict::Transient
        );
        // 响应体无法解析时按「成功」归类，但缺少新令牌会在 resolve 阶段降级为瞬时失败
        assert_eq!(
            classify_refresh_response(200, None, None),
            RefreshVerdict::Refreshed
        );
        assert_eq!(
            resolve_refreshed_tokens(None, None, Some("old".to_string())),
            None
        );
    }

    #[test]
    fn 续期失败冷却窗口避免刷新风暴() {
        let now = Instant::now();
        assert!(!cooldown_active(None, now, REFRESH_FAILURE_COOLDOWN));
        assert!(cooldown_active(
            Some(now),
            now + Duration::from_secs(1),
            REFRESH_FAILURE_COOLDOWN
        ));
        assert!(!cooldown_active(
            Some(now),
            now + REFRESH_FAILURE_COOLDOWN,
            REFRESH_FAILURE_COOLDOWN
        ));
        // 时钟回拨（失败时间戳在未来）时按「仍在冷却」保守处理，但绝不能 panic
        assert!(cooldown_active(
            Some(now + Duration::from_secs(10)),
            now,
            REFRESH_FAILURE_COOLDOWN
        ));
    }

    // ---------------- 二进制文档上传前校验 ----------------

    use super::{is_binary_doc_ext, is_macro_doc_ext, validate_binary_doc};

    #[test]
    fn 二进制文档扩展名白名单() {
        for ext in ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "PDF", "Docx"] {
            assert!(is_binary_doc_ext(&format!("a.{ext}")), "{ext} 应支持");
        }
        for ext in ["txt", "md", "png", "zip", "exe", ""] {
            assert!(!is_binary_doc_ext(&format!("a.{ext}")), "{ext} 不应支持");
        }
    }

    #[test]
    fn 宏格式一律拒绝() {
        for ext in ["docm", "xlsm", "pptm", "ppsm", "dotm", "xltm", "DOCM"] {
            assert!(is_macro_doc_ext(&format!("a.{ext}")), "{ext} 应判为宏格式");
            let reason = validate_binary_doc(&format!("a.{ext}"), 1024).unwrap_err();
            assert!(reason.contains("宏"), "宏格式原因应可读：{reason}");
        }
        assert!(!is_macro_doc_ext("a.pdf"));
    }

    #[test]
    fn 二进制文档大小边界() {
        // 等于上限放行，超过才拒绝
        assert!(validate_binary_doc("a.pdf", super::CLOUD_BINARY_MAX_BYTES).is_ok());
        let reason = validate_binary_doc("a.pdf", super::CLOUD_BINARY_MAX_BYTES + 1).unwrap_err();
        assert!(reason.contains("50 MB"), "超限原因应可读：{reason}");
    }

    #[test]
    fn 二进制文档不支持的类型给可读原因() {
        let reason = validate_binary_doc("a.svg", 10).unwrap_err();
        assert!(reason.contains("pdf/doc/docx/xls/xlsx/ppt/pptx"));
    }
    // ---------------- 图片附件（md 相对图片同步） ----------------

    use super::{
        detect_image_magic, image_magic_matches_ext, is_supported_image_ext,
        normalize_asset_rel_path, resolve_asset_absolute_path, ImageMagic,
    };

    #[test]
    fn 图片扩展名白名单() {
        assert!(is_supported_image_ext("a.png"));
        assert!(is_supported_image_ext("A.JPG"));
        assert!(is_supported_image_ext("b.jpeg"));
        assert!(is_supported_image_ext("c.gif"));
        assert!(is_supported_image_ext("d.webp"));
        assert!(!is_supported_image_ext("e.svg"));
        assert!(!is_supported_image_ext("f.pdf"));
        assert!(!is_supported_image_ext("noext"));
    }

    #[test]
    fn 魔数识别与扩展名匹配() {
        let png = [0x89u8, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
        let jpeg = [0xffu8, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
        let gif = *b"GIF89a\x00\x00\x00\x00\x00\x00";
        let mut webp = *b"RIFF\x00\x00\x00\x00WEBP";
        webp[4] = 0;

        assert_eq!(detect_image_magic(&png), Some(ImageMagic::Png));
        assert_eq!(detect_image_magic(&jpeg), Some(ImageMagic::Jpeg));
        assert_eq!(detect_image_magic(&gif), Some(ImageMagic::Gif));
        assert_eq!(detect_image_magic(&webp), Some(ImageMagic::WebP));
        assert_eq!(detect_image_magic(b"not an image"), None);

        assert!(image_magic_matches_ext(ImageMagic::Png, "a.png"));
        assert!(image_magic_matches_ext(ImageMagic::Jpeg, "a.jpg"));
        assert!(image_magic_matches_ext(ImageMagic::Jpeg, "a.jpeg"));
        // 伪装文件：png 魔数配 .jpg 扩展名
        assert!(!image_magic_matches_ext(ImageMagic::Png, "a.jpg"));
        assert!(!image_magic_matches_ext(ImageMagic::WebP, "a.png"));
    }

    #[test]
    fn 图片相对路径校验() {
        assert_eq!(normalize_asset_rel_path("images/a.png").unwrap(), "images/a.png");
        assert_eq!(normalize_asset_rel_path(".\\images\\a.png").unwrap(), "images/a.png");
        assert_eq!(
            normalize_asset_rel_path("../a.png").unwrap_err(),
            CloudPathIssue::ParentTraversal
        );
        assert_eq!(
            normalize_asset_rel_path("/etc/passwd").unwrap_err(),
            CloudPathIssue::AbsolutePath
        );
        assert_eq!(
            normalize_asset_rel_path("C:/a.png").unwrap_err(),
            CloudPathIssue::DriveLetter
        );
    }

    #[test]
    fn 图片落点必须在工作区内() {
        let resolved =
            resolve_asset_absolute_path("D:/ws", "D:/ws/notes/a.md", "images/pic.png").unwrap();
        assert!(resolved.replace('\\', "/").ends_with("ws/notes/images/pic.png"));

        // 越界的相对路径被拒绝
        assert_eq!(
            resolve_asset_absolute_path("D:/ws", "D:/ws/a.md", "../../etc/passwd")
                .unwrap_err(),
            CloudPathIssue::ParentTraversal
        );
        // 空工作区根拒绝
        assert_eq!(
            resolve_asset_absolute_path("  ", "D:/ws/a.md", "a.png").unwrap_err(),
            CloudPathIssue::Empty
        );
    }
    // ---------------- 云端文档浏览器的路径/打开决策 ----------------

    use super::{
        cloud_path_to_workspace_relative, decide_cloud_open_action, is_openable_text_path,
        validate_cloud_doc_path, CloudOpenAction, CloudPathIssue,
    };

    #[test]
    fn 云路径规范化_反斜杠与多余分隔符() {
        assert_eq!(validate_cloud_doc_path("tau\\ws\\a.md").unwrap(), "tau/ws/a.md");
        assert_eq!(validate_cloud_doc_path(" /tau//ws///a.md ").unwrap_err(), CloudPathIssue::AbsolutePath);
        assert_eq!(validate_cloud_doc_path("tau//ws//a.md").unwrap(), "tau/ws/a.md");
        assert_eq!(validate_cloud_doc_path("tau/ws/读书 笔记.md").unwrap(), "tau/ws/读书 笔记.md");
    }

    #[test]
    fn 云路径校验_拒绝越界与非法形态() {
        assert_eq!(validate_cloud_doc_path("   ").unwrap_err(), CloudPathIssue::Empty);
        assert_eq!(validate_cloud_doc_path("/etc/passwd").unwrap_err(), CloudPathIssue::AbsolutePath);
        assert_eq!(validate_cloud_doc_path("C:/Users/a.md").unwrap_err(), CloudPathIssue::DriveLetter);
        assert_eq!(
            validate_cloud_doc_path("tau/ws/../../secret.md").unwrap_err(),
            CloudPathIssue::ParentTraversal
        );
        assert_eq!(
            validate_cloud_doc_path("tau/ws/./a.md").unwrap_err(),
            CloudPathIssue::ParentTraversal
        );
        assert_eq!(
            validate_cloud_doc_path("tau/ws/a\u{0}.md").unwrap_err(),
            CloudPathIssue::ControlChar
        );
        assert_eq!(
            validate_cloud_doc_path("tau/ws/a:b.md").unwrap_err(),
            CloudPathIssue::IllegalChar
        );
    }

    #[test]
    fn 云路径还原为工作区相对路径() {
        assert_eq!(
            cloud_path_to_workspace_relative("tau/ws/docs/a.md", "ws").unwrap(),
            "docs/a.md"
        );
        // 工作区名缺失时按 tau/ 直接剥
        assert_eq!(
            cloud_path_to_workspace_relative("tau/a.md", "").unwrap(),
            "a.md"
        );
        // 别的 workspace 的文档不能落到当前工作区
        assert_eq!(
            cloud_path_to_workspace_relative("tau/other/a.md", "ws").unwrap_err(),
            CloudPathIssue::NotUnderWorkspace
        );
        // 目录本身不是可打开的文件
        assert_eq!(
            cloud_path_to_workspace_relative("tau/ws/", "ws").unwrap_err(),
            CloudPathIssue::Empty
        );
    }

    #[test]
    fn 文本扩展名白名单与后端一致() {
        assert!(is_openable_text_path("/ws/a.md"));
        assert!(is_openable_text_path("D:\\ws\\a.TSX"));
        assert!(is_openable_text_path("/ws/notes.markdown"));
        // 二进制 / 无扩展名一律不可打开
        assert!(!is_openable_text_path("/ws/a.png"));
        assert!(!is_openable_text_path("/ws/a.pdf"));
        assert!(!is_openable_text_path("/ws/README"));
        assert!(!is_openable_text_path("/ws/.gitignore"));
    }

    #[test]
    fn 打开动作决策_已同步直接开_内容不同要确认_二进制拒绝() {
        // 本地存在且哈希一致 → 直接开标签
        assert_eq!(
            decide_cloud_open_action(true, true, true),
            CloudOpenAction::OpenExisting
        );
        // 本地存在但内容不同 → 先确认
        assert_eq!(
            decide_cloud_open_action(true, true, false),
            CloudOpenAction::ConfirmOverwrite
        );
        // 本地不存在 → 落盘后打开
        assert_eq!(
            decide_cloud_open_action(true, false, false),
            CloudOpenAction::WriteAndOpen
        );
        // 不可打开（二进制/超限）：无论本地是否存在都拒绝
        assert_eq!(
            decide_cloud_open_action(false, true, true),
            CloudOpenAction::Rejected
        );
        assert_eq!(
            decide_cloud_open_action(false, false, false),
            CloudOpenAction::Rejected
        );
        assert_eq!(CloudOpenAction::Rejected.as_str(), "rejected");
        assert_eq!(CloudOpenAction::OpenExisting.as_str(), "openExisting");
        assert_eq!(CloudOpenAction::ConfirmOverwrite.as_str(), "confirmOverwrite");
        assert_eq!(CloudOpenAction::WriteAndOpen.as_str(), "writeAndOpen");
    }
}
