/**
 * @description 应用私有语言服务器安装和状态查询 Tauri 命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 16:25
 */
use sha2::{Digest, Sha256};
use std::fs;
use tauri::{AppHandle, Manager};

use crate::lsp::LspProvisioner;
use crate::models::{
    CommandError, LspInstallRequest, LspProvisionStatus, LspProvisionStatusRequest,
    LspProvisionStatusResponse,
};

/// 查询指定服务器或全部应用私有语言服务器状态。
#[tauri::command]
pub fn lsp_provision_status(
    app: AppHandle,
    request: Option<LspProvisionStatusRequest>,
) -> Result<LspProvisionStatusResponse, CommandError> {
    let server_id = request
        .as_ref()
        .and_then(|value| value.server_id.as_deref());
    provisioner(&app)?.status(server_id)
}

/// 下载并安装应用私有语言服务器。
///
/// 调用方必须从受信任的内置发行清单传入 URL 和 SHA-256；下载地址不会直接用于启动，
/// 安装完成后返回可执行文件绝对路径，供 LSP Supervisor 启动。
#[tauri::command]
pub async fn lsp_install_server(
    app: AppHandle,
    request: LspInstallRequest,
) -> Result<LspProvisionStatus, CommandError> {
    provisioner(&app)?.install(request).await
}

/// 返回应用私有、按工作区隔离的语言服务器数据目录。
///
/// 该目录用于 JDT LS 等会生成索引/缓存的语言服务器，绝不写入用户项目目录。
#[tauri::command]
pub fn lsp_workspace_data_dir(app: AppHandle, root_path: String) -> Result<String, CommandError> {
    if root_path.trim().is_empty() {
        return Err(CommandError::new("INVALID_WORKSPACE", "工作区路径不能为空"));
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::new("LSP_PATH_UNAVAILABLE", error.to_string()))?;
    let mut hasher = Sha256::new();
    hasher.update(root_path.replace('\\', "/").as_bytes());
    let workspace_key = format!("{:x}", hasher.finalize());
    let data_dir = app_data_dir.join("lsp-workspaces").join(workspace_key);
    fs::create_dir_all(&data_dir)
        .map_err(|error| CommandError::new("LSP_PATH_UNAVAILABLE", error.to_string()))?;
    Ok(data_dir.to_string_lossy().to_string())
}

fn provisioner(app: &AppHandle) -> Result<LspProvisioner, CommandError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::new("LSP_PATH_UNAVAILABLE", error.to_string()))?;
    Ok(LspProvisioner::new(app_data_dir))
}
