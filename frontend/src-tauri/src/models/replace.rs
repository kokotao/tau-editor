/**
 * @description Workspace 受 revision 保护的替换请求与响应模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:18
 */
use serde::{Deserialize, Serialize};

use super::SearchOptions;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceOperation {
    pub relative_path: String,
    pub expected_revision: String,
    pub query: String,
    pub replacement: String,
    pub options: SearchOptions,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResponse {
    pub changed: Vec<String>,
    pub conflicts: Vec<String>,
}

/// 单个替换命中：matchId 由「相对路径#序号」组成，命中范围互不重叠。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePreviewMatch {
    pub match_id: String,
    pub line: usize,
    pub column: usize,
    pub length: usize,
    /// 替换前的整行内容。
    pub before: String,
    /// 仅替换该命中后的整行内容，便于逐项确认。
    pub after: String,
}

/// 单个文件的替换预览：携带预览时的 revision，提交前会再次核对。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePreviewFile {
    pub relative_path: String,
    pub revision: String,
    pub matches: Vec<ReplacePreviewMatch>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePreviewResponse {
    pub preview_id: String,
    pub files: Vec<ReplacePreviewFile>,
    pub total_matches: usize,
    pub scanned_files: usize,
    pub truncated: bool,
}

/// 逐文件执行结果：applied / skipped / conflict / failed。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceFileResult {
    pub relative_path: String,
    pub status: String,
    pub applied_match_ids: Vec<String>,
    pub undoable: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceApplyResponse {
    pub preview_id: String,
    pub undo_id: Option<String>,
    pub results: Vec<ReplaceFileResult>,
    pub applied: usize,
    pub skipped: usize,
    pub conflicts: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceUndoResponse {
    pub undo_id: String,
    pub restored: Vec<String>,
    pub conflicts: Vec<String>,
    pub failed: Vec<ReplaceFileResult>,
}
