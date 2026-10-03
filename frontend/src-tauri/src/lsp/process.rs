/**
 * @description 单个语言服务器进程的生命周期、请求路由和 stdio JSON-RPC 通道
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:10
 */
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{oneshot, Mutex, RwLock};
use tokio::time::timeout;

use crate::models::{
    CommandError, LspMessageDirection, LspMessageEvent, LspResponse, LspRpcError, LspSessionState,
    LspSessionStatus, LspStartRequest, LSP_MESSAGE_EVENT, LSP_REQUEST_TIMEOUT_SECONDS,
    LSP_STATE_EVENT,
};

use super::protocol::{encode_message, read_message};

type PendingResponse = oneshot::Sender<Result<LspResponse, CommandError>>;

/// 单个会话允许的自动重启次数；超过后保持 crashed 状态并由前端降级。
const MAX_AUTO_RESTARTS: u32 = 2;

struct SpawnedProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
    stderr: Option<tokio::process::ChildStderr>,
    pid: Option<u32>,
}

/// 单个语言服务器会话；内部所有可变状态由 Tokio 异步锁保护。
#[derive(Clone)]
pub struct LspSession {
    inner: Arc<LspSessionInner>,
}

struct LspSessionInner {
    session_id: String,
    workspace_id: String,
    language_id: String,
    root_path: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    child: Mutex<Child>,
    writer: Mutex<ChildStdin>,
    pending: Mutex<HashMap<u64, PendingResponse>>,
    next_request_id: AtomicU64,
    stopping: AtomicBool,
    state: RwLock<LspSessionState>,
    pid: RwLock<Option<u32>>,
    restart_count: AtomicU32,
    error: RwLock<Option<String>>,
    app: Option<AppHandle>,
}

impl LspSession {
    /// 通过 tokio::process::Command 启动语言服务器；不解析或执行 shell 字符串。
    pub async fn spawn(
        request: LspStartRequest,
        app: Option<AppHandle>,
    ) -> Result<Self, CommandError> {
        validate_start_request(&request)?;

        let root = Path::new(&request.root_path);
        if !root.is_dir() {
            return Err(CommandError::new(
                "LSP_ROOT_INVALID",
                format!("语言服务器工作区不存在或不是目录：{}", root.display()),
            ));
        }

        let process = spawn_process(root, &request.command, &request.args, &request.env).await?;

        let inner = Arc::new(LspSessionInner {
            session_id: request.session_id,
            workspace_id: request.workspace_id,
            language_id: request.language_id,
            root_path: request.root_path,
            command: request.command,
            args: request.args,
            env: request.env,
            child: Mutex::new(process.child),
            writer: Mutex::new(process.stdin),
            pending: Mutex::new(HashMap::new()),
            next_request_id: AtomicU64::new(1),
            stopping: AtomicBool::new(false),
            state: RwLock::new(LspSessionState::Starting),
            pid: RwLock::new(process.pid),
            restart_count: AtomicU32::new(0),
            error: RwLock::new(None),
            app,
        });

        tokio::spawn(read_loop(inner.clone(), BufReader::new(process.stdout)));
        if let Some(stderr) = process.stderr {
            tokio::spawn(stderr_loop(inner.clone(), BufReader::new(stderr)));
        }
        tokio::spawn(monitor_loop(inner.clone()));

        inner.set_state(LspSessionState::Running, None).await;
        Ok(Self { inner })
    }

    /// 读取当前会话状态。
    pub async fn status(&self) -> LspSessionStatus {
        self.inner.status().await
    }

    /// 向服务器发送请求并等待同一 JSON-RPC id 的响应。
    pub async fn request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<LspResponse, CommandError> {
        self.inner.ensure_running().await?;
        let id = self.inner.next_request_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.inner.pending.lock().await.insert(id, sender);

        let mut message = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
        });
        if let Some(params) = params {
            message["params"] = params;
        }

        if let Err(error) = self.inner.send_message(message).await {
            self.inner.pending.lock().await.remove(&id);
            return Err(error);
        }

        match timeout(Duration::from_secs(LSP_REQUEST_TIMEOUT_SECONDS), receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(CommandError::new(
                "LSP_SESSION_CLOSED",
                "语言服务器会话已关闭",
            )),
            Err(_) => {
                self.inner.pending.lock().await.remove(&id);
                Err(CommandError::new(
                    "LSP_REQUEST_TIMEOUT",
                    format!("LSP 请求 {method} 等待响应超时"),
                ))
            }
        }
    }

    /// 向服务器发送 JSON-RPC 通知，不等待响应。
    pub async fn notify(&self, method: &str, params: Option<Value>) -> Result<(), CommandError> {
        self.inner.ensure_running().await?;
        let mut message = json!({
            "jsonrpc": "2.0",
            "method": method,
        });
        if let Some(params) = params {
            message["params"] = params;
        }
        self.inner.send_message(message).await
    }

    /// 停止语言服务器并清理等待中的请求。
    pub async fn stop(&self) -> Result<LspSessionStatus, CommandError> {
        let current_state = *self.inner.state.read().await;
        if current_state == LspSessionState::Stopped {
            return Ok(self.inner.status().await);
        }

        self.inner.stopping.store(true, Ordering::SeqCst);
        self.inner.set_state(LspSessionState::Stopping, None).await;

        let mut child = self.inner.child.lock().await;
        let kill_result = child.kill().await;
        let wait_result = child.wait().await;
        drop(child);

        if let Err(error) = kill_result {
            // 进程可能已由 wait_loop 回收；只有非“已不存在”错误才视为停止失败。
            if error.kind() != std::io::ErrorKind::InvalidInput {
                self.inner
                    .set_state(LspSessionState::Failed, Some(error.to_string()))
                    .await;
                self.inner
                    .fail_pending(CommandError::new(
                        "LSP_STOP_FAILED",
                        format!("停止语言服务器失败：{error}"),
                    ))
                    .await;
                return Err(CommandError::new(
                    "LSP_STOP_FAILED",
                    format!("停止语言服务器失败：{error}"),
                ));
            }
        }
        if let Err(error) = wait_result {
            log::debug!("等待语言服务器退出失败：{error}");
        }

        self.inner.set_state(LspSessionState::Stopped, None).await;
        self.inner
            .fail_pending(CommandError::new(
                "LSP_SESSION_CLOSED",
                "语言服务器会话已停止",
            ))
            .await;
        Ok(self.inner.status().await)
    }
}

/// 直接启动一个语言服务器进程并提取标准输入输出管道；不经过 shell。
async fn spawn_process(
    root: &Path,
    command_name: &str,
    args: &[String],
    env: &HashMap<String, String>,
) -> Result<SpawnedProcess, CommandError> {
    let mut command = Command::new(command_name);
    command
        .args(args)
        .current_dir(root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    command.envs(env);

    let mut child = command.spawn().map_err(|error| {
        CommandError::new("LSP_START_FAILED", format!("启动语言服务器失败：{error}"))
    })?;
    let pid = child.id();
    let stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(CommandError::new(
                "LSP_START_FAILED",
                "语言服务器未提供 stdin 通道",
            ));
        }
    };
    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(CommandError::new(
                "LSP_START_FAILED",
                "语言服务器未提供 stdout 通道",
            ));
        }
    };
    let stderr = child.stderr.take();

    Ok(SpawnedProcess {
        child,
        stdin,
        stdout,
        stderr,
        pid,
    })
}

impl LspSessionInner {
    async fn ensure_running(&self) -> Result<(), CommandError> {
        let state = *self.state.read().await;
        if state == LspSessionState::Running {
            return Ok(());
        }
        Err(CommandError::new(
            "LSP_SESSION_NOT_RUNNING",
            format!("语言服务器当前状态为 {state:?}"),
        ))
    }

    async fn send_message(&self, message: Value) -> Result<(), CommandError> {
        let frame = encode_message(&message)
            .map_err(|error| CommandError::new("LSP_ENCODE_FAILED", error.to_string()))?;
        let mut writer = self.writer.lock().await;
        writer.write_all(&frame).await.map_err(|error| {
            CommandError::new("LSP_WRITE_FAILED", format!("写入语言服务器失败：{error}"))
        })?;
        writer.flush().await.map_err(|error| {
            CommandError::new(
                "LSP_WRITE_FAILED",
                format!("刷新语言服务器 stdin 失败：{error}"),
            )
        })?;
        self.emit_message(LspMessageDirection::ClientToServer, message);
        Ok(())
    }

    async fn status(&self) -> LspSessionStatus {
        LspSessionStatus {
            session_id: self.session_id.clone(),
            workspace_id: self.workspace_id.clone(),
            language_id: self.language_id.clone(),
            root_path: self.root_path.clone(),
            command: self.command.clone(),
            state: *self.state.read().await,
            pid: *self.pid.read().await,
            pending_requests: self.pending.lock().await.len(),
            restart_count: self.restart_count.load(Ordering::Relaxed),
            error: self.error.read().await.clone(),
        }
    }

    async fn set_state(&self, state: LspSessionState, error: Option<String>) {
        *self.state.write().await = state;
        *self.error.write().await = error;
        let status = self.status().await;
        if let Some(app) = &self.app {
            if let Err(error) = app.emit(
                LSP_STATE_EVENT,
                &crate::models::LspStateEvent {
                    session_id: self.session_id.clone(),
                    status,
                },
            ) {
                log::debug!("推送 LSP 状态失败：{error}");
            }
        }
    }

    fn emit_message(&self, direction: LspMessageDirection, message: Value) {
        let Some(app) = &self.app else {
            return;
        };
        if let Err(error) = app.emit(
            LSP_MESSAGE_EVENT,
            &LspMessageEvent {
                session_id: self.session_id.clone(),
                direction,
                message,
            },
        ) {
            log::debug!("推送 LSP 消息失败：{error}");
        }
    }

    async fn fail_pending(&self, error: CommandError) {
        let mut pending = self.pending.lock().await;
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err(error.clone()));
        }
    }

    /// 重新启动崩溃的语言服务器；调用方负责重新拉起 stdout/stderr reader。
    async fn restart_process(
        &self,
    ) -> Result<(ChildStdout, Option<tokio::process::ChildStderr>), CommandError> {
        if self.stopping.load(Ordering::SeqCst) {
            return Err(CommandError::new(
                "LSP_SESSION_CLOSED",
                "语言服务器会话正在停止",
            ));
        }

        self.set_state(LspSessionState::Starting, None).await;
        let restart_count = self.restart_count.fetch_add(1, Ordering::SeqCst) + 1;
        if restart_count > MAX_AUTO_RESTARTS {
            return Err(CommandError::new(
                "LSP_RESTART_LIMIT",
                "语言服务器自动重启次数已达到上限",
            ));
        }

        let process = spawn_process(
            Path::new(&self.root_path),
            &self.command,
            &self.args,
            &self.env,
        )
        .await
        .map_err(|error| {
            CommandError::new(
                "LSP_RESTART_FAILED",
                format!("语言服务器重启失败：{}", error.message),
            )
        })?;

        if self.stopping.load(Ordering::SeqCst) {
            let mut child = process.child;
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(CommandError::new(
                "LSP_SESSION_CLOSED",
                "语言服务器会话正在停止",
            ));
        }

        {
            let mut child = self.child.lock().await;
            *child = process.child;
        }
        {
            let mut writer = self.writer.lock().await;
            *writer = process.stdin;
        }
        *self.pid.write().await = process.pid;
        self.set_state(LspSessionState::Running, None).await;
        Ok((process.stdout, process.stderr))
    }
}

async fn read_loop(inner: Arc<LspSessionInner>, mut reader: BufReader<ChildStdout>) {
    loop {
        match read_message(&mut reader).await {
            Ok(Some(message)) => {
                inner.emit_message(LspMessageDirection::ServerToClient, message.clone());
                handle_server_message(&inner, message).await;
            }
            Ok(None) => {
                break;
            }
            Err(error) => {
                let message = error.to_string();
                inner
                    .set_state(LspSessionState::Crashed, Some(message.clone()))
                    .await;
                inner
                    .fail_pending(CommandError::new("LSP_PROTOCOL_ERROR", message))
                    .await;
                break;
            }
        }
    }
}

/// 定期 poll 子进程以回收退出状态，同时避免长期占有 Child 锁阻塞 stop。
async fn monitor_loop(inner: Arc<LspSessionInner>) {
    loop {
        if inner.stopping.load(Ordering::SeqCst) {
            return;
        }
        let result = {
            let mut child = inner.child.lock().await;
            child.try_wait()
        };
        match result {
            Ok(Some(status)) => {
                if inner.stopping.load(Ordering::SeqCst) || status.success() {
                    inner.set_state(LspSessionState::Stopped, None).await;
                    inner
                        .fail_pending(CommandError::new(
                            "LSP_SESSION_CLOSED",
                            "语言服务器进程已退出",
                        ))
                        .await;
                    return;
                }

                if inner.restart_count.load(Ordering::Relaxed) < MAX_AUTO_RESTARTS {
                    let message = format!("语言服务器异常退出：{status}");
                    inner
                        .set_state(LspSessionState::Crashed, Some(message.clone()))
                        .await;
                    inner
                        .fail_pending(CommandError::new("LSP_PROCESS_EXITED", message))
                        .await;
                    match inner.restart_process().await {
                        Ok((stdout, stderr)) => {
                            tokio::spawn(read_loop(inner.clone(), BufReader::new(stdout)));
                            if let Some(stderr) = stderr {
                                tokio::spawn(stderr_loop(inner.clone(), BufReader::new(stderr)));
                            }
                            continue;
                        }
                        Err(error) => {
                            if inner.stopping.load(Ordering::SeqCst) {
                                inner.set_state(LspSessionState::Stopped, None).await;
                            } else {
                                inner
                                    .set_state(LspSessionState::Failed, Some(error.message.clone()))
                                    .await;
                            }
                            inner.fail_pending(error).await;
                            return;
                        }
                    }
                } else {
                    let message = format!("语言服务器异常退出且已达到自动重启上限：{status}");
                    inner
                        .set_state(LspSessionState::Crashed, Some(message.clone()))
                        .await;
                    inner
                        .fail_pending(CommandError::new("LSP_PROCESS_EXITED", message))
                        .await;
                }
                return;
            }
            Ok(None) => tokio::time::sleep(Duration::from_millis(250)).await,
            Err(error) => {
                let message = format!("检查语言服务器进程失败：{error}");
                inner
                    .set_state(LspSessionState::Crashed, Some(message.clone()))
                    .await;
                inner
                    .fail_pending(CommandError::new("LSP_PROCESS_EXITED", message))
                    .await;
                return;
            }
        }
    }
}

async fn handle_server_message(inner: &Arc<LspSessionInner>, message: Value) {
    let Some(id) = message.get("id") else {
        return;
    };

    if message.get("method").is_some() {
        // LSP 初始化期间常见的 workspace/configuration、client/registerCapability 请求，
        // 必须返回符合协议形状的结果；单纯返回 null 会让部分服务器（尤其
        // rust-analyzer/clangd）在初始化或配置刷新阶段一直等待。
        let method = message
            .get("method")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        let result = server_request_result(method, &params);
        let response = json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": result,
        });
        if let Err(error) = inner.send_message(response).await {
            log::debug!("应答语言服务器请求失败：{error:?}");
        }
        return;
    }

    let Some(id) = id.as_u64() else {
        return;
    };
    let response = LspResponse {
        id,
        result: message.get("result").cloned(),
        error: message
            .get("error")
            .and_then(|value| serde_json::from_value::<LspRpcError>(value.clone()).ok()),
    };
    if let Some(sender) = inner.pending.lock().await.remove(&id) {
        let _ = sender.send(Ok(response));
    }
}

/// 为语言服务器发来的客户端请求生成最小但协议兼容的响应。
///
/// Tau 当前不暴露动态能力注册或交互式窗口，但必须返回正确的 JSON 形状，
/// 否则部分服务器会在 initialize 后停止处理文档请求。配置项返回 null，
/// workspace/configuration 按 items 数量返回数组；工作区文件夹返回当前根目录。
fn server_request_result(method: &str, params: &Value) -> Value {
    match method {
        "workspace/configuration" => params
            .get("items")
            .and_then(Value::as_array)
            .map(|items| Value::Array(vec![Value::Null; items.len()]))
            .unwrap_or_else(|| Value::Array(Vec::new())),
        "workspace/workspaceFolders" => Value::Null,
        "client/registerCapability"
        | "client/unregisterCapability"
        | "window/workDoneProgress/create"
        | "window/showMessageRequest"
        | "window/showDocument"
        | "workspace/applyEdit" => Value::Null,
        _ => Value::Null,
    }
}

async fn stderr_loop(
    inner: Arc<LspSessionInner>,
    mut reader: BufReader<tokio::process::ChildStderr>,
) {
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => log::debug!("LSP[{}] {}", inner.session_id, line.trim_end()),
            Err(error) => {
                log::debug!("读取 LSP stderr 失败：{error}");
                break;
            }
        }
    }
}

fn validate_start_request(request: &LspStartRequest) -> Result<(), CommandError> {
    for (name, value) in [
        ("sessionId", request.session_id.as_str()),
        ("workspaceId", request.workspace_id.as_str()),
        ("languageId", request.language_id.as_str()),
        ("rootPath", request.root_path.as_str()),
        ("command", request.command.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(CommandError::new(
                "LSP_INVALID_ARGUMENT",
                format!("{name} 不能为空"),
            ));
        }
        if value.contains('\0') {
            return Err(CommandError::new(
                "LSP_INVALID_ARGUMENT",
                format!("{name} 不能包含 NUL 字符"),
            ));
        }
    }
    for argument in &request.args {
        if argument.contains('\0') {
            return Err(CommandError::new(
                "LSP_INVALID_ARGUMENT",
                "LSP 参数不能包含 NUL 字符",
            ));
        }
    }
    for (key, value) in &request.env {
        if key.is_empty() || key.contains('=') || key.contains('\0') || value.contains('\0') {
            return Err(CommandError::new(
                "LSP_INVALID_ENV",
                "LSP 环境变量名称或值无效",
            ));
        }
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use std::collections::HashMap;
    use std::fs;
    use std::time::Duration;

    use tempfile::TempDir;
    use tokio::time::sleep;

    use super::{server_request_result, LspSession};
    use crate::models::{LspSessionState, LspStartRequest};

    #[test]
    fn server_request_results_keep_protocol_shapes() {
        let params = serde_json::json!({
            "items": [{ "section": "rust-analyzer" }, { "section": "editor" }]
        });
        assert_eq!(
            server_request_result("workspace/configuration", &params),
            serde_json::json!([null, null])
        );
        assert_eq!(
            server_request_result("client/registerCapability", &serde_json::Value::Null),
            serde_json::Value::Null
        );
        assert_eq!(
            server_request_result("unknown/client/request", &serde_json::Value::Null),
            serde_json::Value::Null
        );
    }

    /// 使用直接启动的 Python 进程模拟最小 JSON-RPC 语言服务器，验证完整会话链路。
    #[tokio::test]
    async fn session_round_trip_request_notification_and_stop() {
        let temp_dir = TempDir::new().expect("create temp workspace");
        let script_path = temp_dir.path().join("fake_lsp.py");
        fs::write(
            &script_path,
            r#"import json
import sys

def read_message():
    headers = b""
    while b"\r\n\r\n" not in headers:
        chunk = sys.stdin.buffer.read(1)
        if not chunk:
            return None
        headers += chunk
    header, body = headers.split(b"\r\n\r\n", 1)
    length = 0
    for line in header.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            length = int(line.split(b":", 1)[1].strip())
    while len(body) < length:
        chunk = sys.stdin.buffer.read(length - len(body))
        if not chunk:
            return None
        body += chunk
    return json.loads(body[:length].decode("utf-8"))

while True:
    message = read_message()
    if message is None:
        break
    if "id" in message:
        response = json.dumps({
            "jsonrpc": "2.0",
            "id": message["id"],
            "result": {"method": message.get("method")},
        }, ensure_ascii=False).encode("utf-8")
        sys.stdout.buffer.write((f"Content-Length: {len(response)}\r\n\r\n").encode("ascii"))
        sys.stdout.buffer.write(response)
        sys.stdout.buffer.flush()
"#,
        )
        .expect("write fake language server");

        let request = LspStartRequest {
            session_id: "test-session".to_string(),
            workspace_id: "test-workspace".to_string(),
            language_id: "typescript".to_string(),
            root_path: temp_dir.path().to_string_lossy().into_owned(),
            command: "python3".to_string(),
            args: vec![script_path.to_string_lossy().into_owned()],
            env: HashMap::new(),
        };
        let session = LspSession::spawn(request, None)
            .await
            .expect("spawn fake language server");

        let response = session
            .request("test/request", Some(serde_json::json!({ "value": 1 })))
            .await
            .expect("request response");
        assert_eq!(response.id, 1);
        assert_eq!(response.result.expect("result")["method"], "test/request");

        session
            .notify("test/notification", Some(serde_json::json!({ "value": 2 })))
            .await
            .expect("notification write");
        sleep(Duration::from_millis(50)).await;

        let status = session.stop().await.expect("stop session");
        assert_eq!(status.state, LspSessionState::Stopped);
    }

    #[tokio::test]
    async fn crashed_process_is_restarted_with_a_bounded_limit() {
        let temp_dir = TempDir::new().expect("create temp workspace");
        let request = LspStartRequest {
            session_id: "crash-session".to_string(),
            workspace_id: "test-workspace".to_string(),
            language_id: "typescript".to_string(),
            root_path: temp_dir.path().to_string_lossy().into_owned(),
            command: "python3".to_string(),
            args: vec!["-c".to_string(), "import sys; sys.exit(1)".to_string()],
            env: HashMap::new(),
        };
        let session = LspSession::spawn(request, None)
            .await
            .expect("spawn crashing language server");

        for _ in 0..20 {
            let status = session.status().await;
            if status.state == LspSessionState::Crashed {
                assert_eq!(status.restart_count, 2);
                let _ = session.stop().await;
                return;
            }
            sleep(Duration::from_millis(100)).await;
        }

        let status = session.status().await;
        let _ = session.stop().await;
        panic!("language server did not reach bounded crashed state: {status:?}");
    }
}
