/**
 * @description Tauri Workspace Runtime 的结构化命令错误模型
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 10:00
 */
use serde::Serialize;

/// 可安全传递给渲染端的命令错误。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl CommandError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new("IO_ERROR", message)
    }
}
