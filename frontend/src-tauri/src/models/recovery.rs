/**
 * @description 本地恢复库 v2 的持久化模型，兼容完整编辑器标签快照
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:10
 */
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const RECOVERY_DOCUMENT_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryOpenTab {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub view_state: Option<Value>,
    #[serde(default)]
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySessionDocument {
    pub version: u32,
    pub saved_at: u64,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub active_tab_path: Option<String>,
    #[serde(default)]
    pub open_tabs: Vec<RecoveryOpenTab>,
    #[serde(default)]
    pub layout: Value,
    #[serde(default)]
    pub recent_workspaces: Vec<String>,
    #[serde(default)]
    pub tabs: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryBaseFingerprint {
    #[serde(default)]
    pub mtime_ms: Option<u64>,
    #[serde(default)]
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCursor {
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDraftRecord {
    pub version: u32,
    pub id: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub base_fingerprint: Option<RecoveryBaseFingerprint>,
    pub content: String,
    pub updated_at: u64,
    #[serde(default)]
    pub cursor: Option<RecoveryCursor>,
    #[serde(default)]
    pub scroll_top: Option<f64>,
    #[serde(default)]
    pub tab: Option<Value>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryLimits {
    pub max_drafts: usize,
    pub max_total_bytes: usize,
    pub max_age_days: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRecordsResponse {
    pub session: Option<RecoverySessionDocument>,
    pub drafts: Vec<RecoveryDraftRecord>,
    pub limits: RecoveryLimits,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryWriteResponse {
    pub written_drafts: usize,
    pub deleted_drafts: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDeleteResponse {
    pub deleted: usize,
}
