/**
 * @description 大文件分段写入事务模型：事务句柄、写入进度、提交与中止结果
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:52
 */
use serde::Serialize;

/// 单次追加分片的最大字节数，避免一次 IPC 传输过大内容。
pub const MAX_TRANSACTION_CHUNK_BYTES: u64 = 1024 * 1024;
/// 单个事务累计可写入的最大字节数。
pub const MAX_TRANSACTION_TOTAL_BYTES: u64 = 512 * 1024 * 1024;
/// 事务空闲超时时间，超时后自动清理临时文件。
pub const TRANSACTION_TIMEOUT_SECONDS: u64 = 15 * 60;

/// 事务开始后返回给前端的句柄。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteTransactionHandle {
    pub transaction_id: String,
    pub expected_revision: String,
    pub max_chunk_bytes: u64,
    pub max_total_bytes: u64,
}

/// 单次追加写入后的进度。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteTransactionProgress {
    pub transaction_id: String,
    pub bytes_written: u64,
}

/// 事务提交成功后的新版本信息。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteTransactionCommit {
    pub revision: String,
    pub size: u64,
    pub modified_ms: u64,
}

/// 事务中止结果。
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteTransactionAbort {
    pub aborted: bool,
}
