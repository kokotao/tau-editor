/**
 * @description LSP 会话、JSON-RPC 请求响应与 Tauri 事件模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:10
 */
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// LSP 通道向前端推送原始消息的事件名。
pub const LSP_MESSAGE_EVENT: &str = "lsp:message";
/// LSP 会话状态变化事件名。
pub const LSP_STATE_EVENT: &str = "lsp:state";
/// 语言服务器启动、请求与停止使用的默认超时时间。
pub const LSP_REQUEST_TIMEOUT_SECONDS: u64 = 30;

/// 启动一个语言服务器会话的参数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStartRequest {
    /// 当前工作区内保持稳定的会话 ID。
    pub session_id: String,
    /// 工作区业务 ID；用于前端映射和状态展示。
    pub workspace_id: String,
    /// Monaco language ID，例如 typescript、javascript。
    pub language_id: String,
    /// 语言服务器工作目录。
    pub root_path: String,
    /// 可执行文件或绝对路径；后端使用 tokio::process::Command 原样启动，不经过 shell。
    pub command: String,
    /// 传给语言服务器的参数列表。
    #[serde(default)]
    pub args: Vec<String>,
    /// 额外环境变量；只影响当前语言服务器进程。
    #[serde(default)]
    pub env: HashMap<String, String>,
}

/// 向语言服务器发送 JSON-RPC 请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRequest {
    pub session_id: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

/// 向语言服务器发送 JSON-RPC 通知。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspNotification {
    pub session_id: String,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

/// 查询单个或全部 LSP 会话。
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LspStatusRequest {
    #[serde(default)]
    pub session_id: Option<String>,
}

/// JSON-RPC 错误对象。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LspRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// Tauri 命令返回的 JSON-RPC 请求结果。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LspResponse {
    pub id: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<LspRpcError>,
}

/// LSP 会话生命周期状态。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LspSessionState {
    Starting,
    Running,
    Stopping,
    Stopped,
    Crashed,
    Failed,
}

/// 对外展示的 LSP 会话状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspSessionStatus {
    pub session_id: String,
    pub workspace_id: String,
    pub language_id: String,
    pub root_path: String,
    pub command: String,
    pub state: LspSessionState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    pub pending_requests: usize,
    pub restart_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 查询全部会话时的结构化响应。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspStatusResponse {
    pub sessions: Vec<LspSessionStatus>,
}

/// LSP 状态变化事件载荷。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspStateEvent {
    pub session_id: String,
    pub status: LspSessionStatus,
}

/// LSP 原始 JSON-RPC 消息事件载荷。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspMessageEvent {
    pub session_id: String,
    pub direction: LspMessageDirection,
    pub message: Value,
}

/// 单个语言服务器的本机只读探测结果。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspServerProbe {
    /// 稳定的服务器标识，对应前端 registry 中的 descriptor.id。
    pub id: String,
    /// 支持的 Monaco/LSP language id 列表。
    pub language_ids: Vec<String>,
    /// registry 中用于启动服务器的命令名。
    pub command: String,
    /// 是否在 PATH 或平台约定路径中找到可执行文件。
    pub installed: bool,
    /// 服务器是否可以被直接启动并完成版本探测。
    pub available: bool,
    /// 找到的可执行文件绝对路径。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// 服务器返回的版本首行（若能取得）。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// 面向设置页的原因或安装提示。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// 本机语言服务器探测响应。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspProbeResponse {
    pub servers: Vec<LspServerProbe>,
}

/// 当前应用运行平台，用于选择应用托管的架构专属资产。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspPlatformInfo {
    pub platform: String,
    pub arch: String,
}

/// 语言服务器安装包格式。
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LspArchiveFormat {
    /// 下载内容本身就是可执行文件。
    Binary,
    /// 下载内容是 zip 压缩包。
    Zip,
    /// gzip 压缩的 tar 包，适用于 Node、rust-analyzer、OmniSharp 等官方资产。
    TarGz,
    /// gzip 压缩的裸可执行文件，例如 rust-analyzer 官方资产。
    Gzip,
}

impl Default for LspArchiveFormat {
    fn default() -> Self {
        Self::Binary
    }
}

/// 查询应用私有语言服务器安装状态。
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LspProvisionStatusRequest {
    /// 只查询一个服务器；省略时返回 manifest 中全部服务器。
    #[serde(default)]
    pub server_id: Option<String>,
}

/// 请求下载并安装一个应用私有语言服务器。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspInstallRequest {
    /// 稳定的内置服务器 ID，不允许包含路径分隔符。
    pub server_id: String,
    /// 服务器发行版本，用于版本隔离和升级。
    pub version: String,
    /// 官方发行包 URL；仅允许 http/https。
    pub download_url: String,
    /// 发行包 SHA-256（64 位十六进制，小写/大写均可）。
    pub sha256: String,
    /// 下载包格式，默认是裸二进制文件。
    #[serde(default)]
    pub archive_format: LspArchiveFormat,
    /// 启动时实际执行的相对路径；zip 包必须提供或使用包内 server_id 文件。
    #[serde(default)]
    pub executable_path: Option<String>,
    /// 可选的启动命令相对路径；用于 Node/Java 等复合运行时。
    #[serde(default)]
    pub launch_command: Option<String>,
    /// 启动参数；只允许受信任清单提供。
    #[serde(default)]
    pub launch_args: Vec<String>,
    /// 启动环境变量；只影响当前语言服务器进程。
    #[serde(default)]
    pub launch_env: HashMap<String, String>,
}

/// 应用私有语言服务器的安装状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspProvisionStatus {
    pub server_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub installed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_command: Option<String>,
    #[serde(default)]
    pub launch_args: Vec<String>,
    #[serde(default)]
    pub launch_env: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 安装操作返回的状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspInstallResponse {
    pub status: LspProvisionStatus,
}

/// 安装状态查询响应。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LspProvisionStatusResponse {
    pub servers: Vec<LspProvisionStatus>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LspMessageDirection {
    ClientToServer,
    ServerToClient,
}
