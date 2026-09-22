/**
 * @description Markdown 资产导入、链接校验与工作区任务聚合的响应模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 07:05
 */
use serde::{Deserialize, Serialize};

/// 图片资产导入结果；relativePath 为相对当前文档目录的 Markdown 链接目标。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportMarkdownAssetResponse {
    pub relative_path: String,
    pub markdown_snippet: String,
    pub bytes: u64,
    pub reused_existing: bool,
}

/// 单条相对链接的校验结果：ok / missing / outside / external / anchor / unsupported。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownLinkStatus {
    pub target: String,
    pub status: String,
    pub resolved_relative_path: Option<String>,
    pub message: Option<String>,
}

/// 工作区任务聚合的单个任务项。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskItem {
    pub line: usize,
    pub label: String,
    pub completed: bool,
}

/// 工作区任务聚合的单文件结果。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskFile {
    pub relative_path: String,
    pub tasks: Vec<WorkspaceTaskItem>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTaskResponse {
    pub files: Vec<WorkspaceTaskFile>,
    pub total_tasks: usize,
    pub scanned_files: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownLinkQuery {
    pub targets: Vec<String>,
}
