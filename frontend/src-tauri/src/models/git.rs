/**
 * @description Workspace Git 状态与差异响应模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 12:53
 */
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    pub path: String,
    pub index_status: String,
    pub worktree_status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    pub branch: String,
    pub entries: Vec<GitStatusEntry>,
}
