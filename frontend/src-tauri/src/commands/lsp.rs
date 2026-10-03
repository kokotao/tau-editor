/**
 * @description LSP Tauri 命令：启动、请求、通知、停止与查询语言服务器会话
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:10
 */
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, State};
use tokio::process::Command;
use tokio::time::timeout;

use crate::lsp::LspSupervisor;
use crate::models::{
    CommandError, LspNotification, LspRequest, LspResponse, LspSessionStatus, LspStartRequest,
    LspPlatformInfo, LspProbeResponse, LspServerProbe, LspStatusRequest, LspStatusResponse,
};

/// 只读探测使用的内置服务器清单。命令名是受信任的常量，不接受前端传入的任意可执行文件。
const PROBE_SPECS: &[(&str, &[&str], &str)] = &[
    ("typescript-language-server", &["javascript", "typescript", "javascriptreact", "typescriptreact"], "typescript-language-server"),
    ("pyright", &["python"], "pyright-langserver"),
    ("rust-analyzer", &["rust"], "rust-analyzer"),
    ("gopls", &["go"], "gopls"),
    ("clangd", &["c", "cpp"], "clangd"),
    ("jdtls", &["java"], "jdtls"),
    ("omnisharp", &["csharp"], "omnisharp"),
];

/// 启动语言服务器 stdio 会话。
#[tauri::command]
pub async fn lsp_start_session(
    app: AppHandle,
    supervisor: State<'_, LspSupervisor>,
    request: LspStartRequest,
) -> Result<LspSessionStatus, CommandError> {
    supervisor.start(request, Some(app)).await
}

/// 向语言服务器发送一个 JSON-RPC 请求并等待响应。
#[tauri::command]
pub async fn lsp_send_request(
    supervisor: State<'_, LspSupervisor>,
    request: LspRequest,
) -> Result<LspResponse, CommandError> {
    supervisor.request(request).await
}

/// 向语言服务器发送一个 JSON-RPC 通知。
#[tauri::command]
pub async fn lsp_send_notification(
    supervisor: State<'_, LspSupervisor>,
    notification: LspNotification,
) -> Result<(), CommandError> {
    supervisor.notify(notification).await
}

/// 停止并移除语言服务器会话。
#[tauri::command]
pub async fn lsp_stop_session(
    supervisor: State<'_, LspSupervisor>,
    session_id: String,
) -> Result<LspSessionStatus, CommandError> {
    supervisor.stop(&session_id).await
}

/// 查询指定会话或全部语言服务器会话状态。
#[tauri::command]
pub async fn lsp_session_status(
    supervisor: State<'_, LspSupervisor>,
    request: Option<LspStatusRequest>,
) -> Result<LspStatusResponse, CommandError> {
    supervisor
        .status(
            request
                .as_ref()
                .and_then(|value| value.session_id.as_deref()),
        )
        .await
}

/// 只读探测本机已安装的语言服务器。
///
/// 探测严格使用内置白名单命令和 tokio::process::Command，不经过 shell，
/// 不接受任意命令参数，也不会写入文件或启动持久会话。
#[tauri::command]
pub async fn lsp_probe_servers() -> Result<LspProbeResponse, CommandError> {
    let mut servers = Vec::with_capacity(PROBE_SPECS.len());
    for (id, language_ids, command) in PROBE_SPECS {
        servers.push(probe_server(id, language_ids, command).await);
    }
    Ok(LspProbeResponse { servers })
}

/// 返回当前 Tauri 进程的目标平台和架构，供托管资产选择使用。
#[tauri::command]
pub fn lsp_platform_info() -> LspPlatformInfo {
    let (platform, arch) = normalize_platform_arch(std::env::consts::OS, std::env::consts::ARCH);
    LspPlatformInfo {
        platform: platform.to_string(),
        arch: arch.to_string(),
    }
}

/// 将 Rust target 常见命名归一化为前端资产清单使用的稳定键。
pub(crate) fn normalize_platform_arch(platform: &str, arch: &str) -> (&'static str, &'static str) {
    let normalized_platform = match platform {
        "macos" | "darwin" => "darwin",
        "windows" => "windows",
        "linux" => "linux",
        "android" => "android",
        _ => "unknown",
    };
    let normalized_arch = match arch {
        "aarch64" | "arm64" => "arm64",
        "x86_64" | "x64" => "x64",
        "i686" | "x86" => "x86",
        "arm" | "armv7" => "arm",
        _ => "unknown",
    };
    (normalized_platform, normalized_arch)
}

async fn probe_server(id: &str, language_ids: &[&str], command: &str) -> LspServerProbe {
    let path = resolve_executable(command);
    let Some(path) = path else {
        return LspServerProbe {
            id: id.to_string(),
            language_ids: language_ids.iter().map(|value| (*value).to_string()).collect(),
            command: command.to_string(),
            installed: false,
            available: false,
            path: None,
            version: None,
            reason: Some(format!("未找到 {command}，请安装后重新检测")),
        };
    };

    let path_text = path.to_string_lossy().to_string();
    let output = timeout(
        Duration::from_secs(2),
        Command::new(&path)
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await;

    match output {
        Ok(Ok(output)) => {
            let raw = if output.stdout.is_empty() { &output.stderr } else { &output.stdout };
            let version = String::from_utf8_lossy(raw)
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(|line| line.chars().take(200).collect::<String>());
            let available = output.status.success();
            LspServerProbe {
                id: id.to_string(),
                language_ids: language_ids.iter().map(|value| (*value).to_string()).collect(),
                command: command.to_string(),
                installed: true,
                available,
                path: Some(path_text),
                version,
                reason: if available {
                    None
                } else {
                    Some("已找到可执行文件，但版本探测未成功；可尝试直接启动语言服务器".to_string())
                },
            }
        }
        Ok(Err(error)) => LspServerProbe {
            id: id.to_string(),
            language_ids: language_ids.iter().map(|value| (*value).to_string()).collect(),
            command: command.to_string(),
            installed: true,
            available: false,
            path: Some(path_text),
            version: None,
            reason: Some(format!("启动探测失败：{error}")),
        },
        Err(_) => LspServerProbe {
            id: id.to_string(),
            language_ids: language_ids.iter().map(|value| (*value).to_string()).collect(),
            command: command.to_string(),
            installed: true,
            available: false,
            path: Some(path_text),
            version: None,
            reason: Some("版本探测超时（2 秒）；请检查服务器安装或环境配置".to_string()),
        },
    }
}

fn resolve_executable(command: &str) -> Option<PathBuf> {
    let candidate = Path::new(command);
    if candidate.is_absolute() || command.contains(std::path::MAIN_SEPARATOR) {
        return is_executable(candidate).then(|| candidate.to_path_buf());
    }

    let path_var = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&path_var) {
        let direct = directory.join(command);
        if let Some(path) = is_executable(&direct).then(|| direct) {
            return Some(path);
        }
        #[cfg(windows)]
        for extension in [".exe", ".cmd", ".bat"] {
            let with_extension = directory.join(format!("{command}{extension}"));
            if let Some(path) = is_executable(&with_extension).then(|| with_extension) {
                return Some(path);
            }
        }
    }
    None
}

fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod platform_tests {
    use super::normalize_platform_arch;

    #[test]
    fn normalizes_rust_macos_target_names_to_registry_keys() {
        assert_eq!(normalize_platform_arch("macos", "aarch64"), ("darwin", "arm64"));
        assert_eq!(normalize_platform_arch("macos", "x86_64"), ("darwin", "x64"));
    }

    #[test]
    fn normalizes_windows_and_linux_architecture_aliases() {
        assert_eq!(normalize_platform_arch("windows", "x86_64"), ("windows", "x64"));
        assert_eq!(normalize_platform_arch("linux", "aarch64"), ("linux", "arm64"));
    }
}
