/**
 * @description 工作区文件监听命令：启动/停止监听并查询监听状态
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:35
 */
use std::path::Path;

use tauri::{AppHandle, State};

use crate::models::{CommandError, WorkspaceWatchStatus};
use crate::services::{normalize_debounce_ms, WorkspaceWatcherState};

#[tauri::command]
pub fn start_workspace_watch(
    app: AppHandle,
    state: State<'_, WorkspaceWatcherState>,
    path: String,
    debounce_ms: Option<u64>,
) -> Result<WorkspaceWatchStatus, CommandError> {
    let debounce_ms = normalize_debounce_ms(debounce_ms);
    state.inner().start(app, Path::new(&path), debounce_ms)
}

#[tauri::command]
pub fn stop_workspace_watch(state: State<'_, WorkspaceWatcherState>) -> WorkspaceWatchStatus {
    state.inner().stop()
}

#[tauri::command]
pub fn workspace_watch_status(state: State<'_, WorkspaceWatcherState>) -> WorkspaceWatchStatus {
    state.inner().status()
}
