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
