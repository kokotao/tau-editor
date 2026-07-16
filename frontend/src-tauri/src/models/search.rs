/**
 * @description Workspace 搜索请求与命中响应模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:01
 */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOptions {
    pub is_regex: bool,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub max_results: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub length: usize,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub matches: Vec<SearchMatch>,
    pub truncated: bool,
    pub scanned_files: usize,
}
