/**
 * @description 工作区文件监听事件模型：变更类型、变更载荷与监听状态
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:35
 */
use serde::{Deserialize, Serialize};

/// 后端向前端推送文件变更的 Tauri 事件名。
pub const WORKSPACE_FILE_CHANGED_EVENT: &str = "workspace:file-changed";
pub const DEFAULT_WATCH_DEBOUNCE_MS: u64 = 250;
pub const MIN_WATCH_DEBOUNCE_MS: u64 = 50;
pub const MAX_WATCH_DEBOUNCE_MS: u64 = 2_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkspaceChangeKind {
    Created,
    Modified,
    Removed,
    Renamed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileChange {
    pub path: String,
    #[serde(default)]
    pub old_path: Option<String>,
    pub kind: WorkspaceChangeKind,
    #[serde(default)]
    pub modified_ms: Option<u64>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWatchStatus {
    pub watching: bool,
    #[serde(default)]
    pub root_path: Option<String>,
    pub debounce_ms: u64,
}

impl WorkspaceWatchStatus {
    pub fn idle(debounce_ms: u64) -> Self {
        Self {
            watching: false,
            root_path: None,
            debounce_ms,
        }
    }
}
