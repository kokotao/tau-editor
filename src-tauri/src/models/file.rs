/// 文件相关数据模型

use serde::{Deserialize, Serialize};
use std::time::SystemTime;

/// 文件元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    /// 文件名
    pub name: String,
    /// 完整路径
    pub path: String,
    /// 文件大小 (字节)
    pub size: u64,
    /// 创建时间
    pub created: Option<SystemTime>,
    /// 最后修改时间
    pub modified: Option<SystemTime>,
    /// 最后访问时间
    pub accessed: Option<SystemTime>,
    /// 是否为目录
    pub is_dir: bool,
    /// 文件编码
    pub encoding: Option<String>,
}

/// 文件内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    /// 文件路径
    pub path: String,
    /// 文件内容
    pub content: String,
    /// 文件编码
    pub encoding: String,
    /// 是否已保存
    pub is_saved: bool,
    /// 最后修改时间
    pub modified_at: Option<SystemTime>,
}

impl FileContent {
    /// 创建新的文件内容
    pub fn new(path: String, content: String, encoding: String) -> Self {
        Self {
            path,
            content,
            encoding,
            is_saved: true,
            modified_at: None,
        }
    }
    
    /// 标记为已修改
    pub fn mark_modified(&mut self) {
        self.is_saved = false;
        self.modified_at = Some(SystemTime::now());
    }
    
    /// 标记为已保存
    pub fn mark_saved(&mut self) {
        self.is_saved = true;
    }
}

/// 文件操作结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOperationResult {
    /// 是否成功
    pub success: bool,
    /// 错误信息 (如果有)
    pub error: Option<String>,
    /// 操作类型
    pub operation: String,
    /// 文件路径
    pub path: String,
}

impl FileOperationResult {
    pub fn success(operation: &str, path: &str) -> Self {
        Self {
            success: true,
            error: None,
            operation: operation.to_string(),
            path: path.to_string(),
        }
    }
    
    pub fn error(operation: &str, path: &str, error: &str) -> Self {
        Self {
            success: false,
            error: Some(error.to_string()),
            operation: operation.to_string(),
            path: path.to_string(),
        }
    }
}
