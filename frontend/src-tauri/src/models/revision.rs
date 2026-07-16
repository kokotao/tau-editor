/**
 * @description 文件 Revision 元数据与条件写入响应模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 10:00
 */
use serde::Serialize;
use std::fs::Metadata;
use std::time::UNIX_EPOCH;

use super::error::CommandError;

/// 文件当前版本；revision 固定为 `mtimeNs:size`。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileRevision {
    pub exists: bool,
    pub size: Option<u64>,
    pub modified_ms: Option<u64>,
    pub revision: Option<String>,
    pub content_hash: Option<String>,
}

impl FileRevision {
    pub fn missing() -> Self {
        Self {
            exists: false,
            size: None,
            modified_ms: None,
            revision: None,
            content_hash: None,
        }
    }

    pub fn from_metadata(metadata: &Metadata) -> Result<Self, CommandError> {
        let modified = metadata
            .modified()
            .map_err(|error| CommandError::io(format!("无法读取文件修改时间：{error}")))?
            .duration_since(UNIX_EPOCH)
            .map_err(|error| CommandError::io(format!("文件修改时间无效：{error}")))?;
        let modified_ns = modified.as_nanos();
        let size = metadata.len();

        Ok(Self {
            exists: true,
            size: Some(size),
            modified_ms: Some(modified.as_millis().try_into().unwrap_or(u64::MAX)),
            revision: Some(format!("{modified_ns}:{size}")),
            content_hash: None,
        })
    }
}

/// 条件写入成功后返回的新版本。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileResponse {
    pub revision: String,
}
