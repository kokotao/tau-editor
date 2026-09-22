/**
 * @description 大文件分段写入事务命令：开启事务、追加分片、提交与中止
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:52
 */
use tauri::State;

use crate::commands::WorkspaceRegistry;
use crate::models::{
    CommandError, FileWriteTransactionAbort, FileWriteTransactionCommit,
    FileWriteTransactionHandle, FileWriteTransactionProgress,
};
use crate::services::{
    abort_file_transaction, append_file_transaction_chunk, begin_file_transaction,
    commit_file_transaction, FileTransactionRegistry,
};

/// 开启分段写入事务；此时校验基准 revision，后续分片写入临时文件。
#[tauri::command]
pub fn begin_file_write_transaction(
    transactions: State<'_, FileTransactionRegistry>,
    workspaces: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_path: String,
    expected_revision: String,
) -> Result<FileWriteTransactionHandle, CommandError> {
    begin_file_transaction(
        transactions.inner(),
        workspaces.inner(),
        &workspace_id,
        &relative_path,
        &expected_revision,
    )
}

/// 追加一个分片到事务临时文件。
#[tauri::command]
pub fn append_file_write_transaction_chunk(
    transactions: State<'_, FileTransactionRegistry>,
    transaction_id: String,
    content: String,
) -> Result<FileWriteTransactionProgress, CommandError> {
    append_file_transaction_chunk(transactions.inner(), &transaction_id, &content)
}

/// 提交事务；提交前再次校验 revision，冲突时保留磁盘内容。
#[tauri::command]
pub fn commit_file_write_transaction(
    transactions: State<'_, FileTransactionRegistry>,
    transaction_id: String,
) -> Result<FileWriteTransactionCommit, CommandError> {
    commit_file_transaction(transactions.inner(), &transaction_id)
}

/// 中止事务并删除临时文件。
#[tauri::command]
pub fn abort_file_write_transaction(
    transactions: State<'_, FileTransactionRegistry>,
    transaction_id: String,
) -> Result<FileWriteTransactionAbort, CommandError> {
    abort_file_transaction(transactions.inner(), &transaction_id)
}
