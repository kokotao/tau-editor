/**
 * @description 大文件分段写入事务服务：临时文件分段追加、提交前 revision 复核、原子替换与超时清理
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:52
 */
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::commands::{replace_existing_file, sync_parent_directory, WorkspaceRegistry};
use crate::models::{
    CommandError, FileRevision, FileWriteTransactionAbort, FileWriteTransactionCommit,
    FileWriteTransactionHandle, FileWriteTransactionProgress, MAX_TRANSACTION_CHUNK_BYTES,
    MAX_TRANSACTION_TOTAL_BYTES, TRANSACTION_TIMEOUT_SECONDS,
};

static NEXT_TRANSACTION_ID: AtomicU64 = AtomicU64::new(1);

struct PendingTransaction {
    target: PathBuf,
    temporary_path: PathBuf,
    expected_revision: String,
    file: File,
    bytes_written: u64,
    created_at: Instant,
}

/// 由 Tauri 托管的分段写入事务注册表；同一时间可存在多个未提交事务。
#[derive(Default)]
pub struct FileTransactionRegistry {
    transactions: Mutex<HashMap<String, PendingTransaction>>,
}

impl FileTransactionRegistry {
    fn lock(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, PendingTransaction>>, CommandError> {
        self.transactions
            .lock()
            .map_err(|_| CommandError::io("写入事务注册表不可用"))
    }

    /// 清理超时事务并删除对应临时文件。
    pub fn purge_expired(&self, now: Instant, timeout: Duration) -> usize {
        let Ok(mut transactions) = self.transactions.lock() else {
            return 0;
        };

        let expired: Vec<String> = transactions
            .iter()
            .filter(|(_, transaction)| now.duration_since(transaction.created_at) >= timeout)
            .map(|(id, _)| id.clone())
            .collect();

        for id in &expired {
            if let Some(transaction) = transactions.remove(id) {
                drop(transaction.file);
                let _ = fs::remove_file(&transaction.temporary_path);
            }
        }

        expired.len()
    }
}

/// 开启分段写入事务：此时立即校验 revision，后续所有分片写入临时文件。
pub fn begin_file_transaction(
    registry: &FileTransactionRegistry,
    workspace_registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    expected_revision: &str,
) -> Result<FileWriteTransactionHandle, CommandError> {
    if expected_revision.is_empty() {
        return Err(CommandError::new(
            "REVISION_REQUIRED",
            "分段写入需要提供基准 revision",
        ));
    }

    let target = crate::commands::workspace_file_path_for_registry(
        workspace_registry,
        workspace_id,
        relative_path,
    )?;
    ensure_expected_revision(&target, expected_revision)?;

    registry.purge_expired(
        Instant::now(),
        Duration::from_secs(TRANSACTION_TIMEOUT_SECONDS),
    );

    let parent = target
        .parent()
        .ok_or_else(|| CommandError::new("PATH_OUTSIDE_WORKSPACE", "目标路径没有父目录"))?;
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| CommandError::new("IO_ERROR", "目标文件名无效"))?;

    let transaction_id = format!("txn-{}", create_transaction_id());
    let temporary_path = parent.join(format!(".{file_name}.{transaction_id}.tmp"));
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary_path)
        .map_err(|error| CommandError::io(format!("无法创建事务临时文件：{error}")))?;

    let mut transactions = registry.lock()?;
    transactions.insert(
        transaction_id.clone(),
        PendingTransaction {
            target,
            temporary_path,
            expected_revision: expected_revision.to_string(),
            file,
            bytes_written: 0,
            created_at: Instant::now(),
        },
    );

    Ok(FileWriteTransactionHandle {
        transaction_id,
        expected_revision: expected_revision.to_string(),
        max_chunk_bytes: MAX_TRANSACTION_CHUNK_BYTES,
        max_total_bytes: MAX_TRANSACTION_TOTAL_BYTES,
    })
}

/// 追加一个分片；内容只写临时文件，不影响磁盘上的原文件。
pub fn append_file_transaction_chunk(
    registry: &FileTransactionRegistry,
    transaction_id: &str,
    content: &str,
) -> Result<FileWriteTransactionProgress, CommandError> {
    let mut transactions = registry.lock()?;
    let transaction = transactions.get_mut(transaction_id).ok_or_else(|| {
        CommandError::new(
            "TRANSACTION_NOT_FOUND",
            "写入事务不存在或已结束，请重新保存",
        )
    })?;

    if transaction.created_at.elapsed() >= Duration::from_secs(TRANSACTION_TIMEOUT_SECONDS) {
        let expired = transactions.remove(transaction_id);
        drop(transactions);
        if let Some(expired) = expired {
            drop(expired.file);
            let _ = fs::remove_file(&expired.temporary_path);
        }
        return Err(CommandError::new(
            "TRANSACTION_EXPIRED",
            "写入事务已超时，请重新保存",
        ));
    }

    let bytes = content.as_bytes();
    let chunk_bytes = bytes.len() as u64;
    if chunk_bytes > MAX_TRANSACTION_CHUNK_BYTES {
        return Err(CommandError::new(
            "CHUNK_TOO_LARGE",
            format!("单个分片不能超过 {MAX_TRANSACTION_CHUNK_BYTES} 字节"),
        ));
    }
    if transaction.bytes_written + chunk_bytes > MAX_TRANSACTION_TOTAL_BYTES {
        return Err(CommandError::new(
            "TOO_LARGE",
            format!("单次写入不能超过 {MAX_TRANSACTION_TOTAL_BYTES} 字节"),
        ));
    }

    transaction
        .file
        .write_all(bytes)
        .map_err(|error| CommandError::io(format!("写入事务临时文件失败：{error}")))?;
    transaction.bytes_written += chunk_bytes;

    Ok(FileWriteTransactionProgress {
        transaction_id: transaction_id.to_string(),
        bytes_written: transaction.bytes_written,
    })
}

/// 提交事务：再次校验 revision，通过后原子替换目标文件。
pub fn commit_file_transaction(
    registry: &FileTransactionRegistry,
    transaction_id: &str,
) -> Result<FileWriteTransactionCommit, CommandError> {
    let transaction = registry
        .lock()?
        .remove(transaction_id)
        .ok_or_else(|| CommandError::new("TRANSACTION_NOT_FOUND", "写入事务不存在或已结束"))?;

    let PendingTransaction {
        target,
        temporary_path,
        expected_revision,
        mut file,
        ..
    } = transaction;

    // Windows 上必须先关闭临时文件句柄，否则无法用 rename 覆盖目标文件。
    let sync_result = file.flush().and_then(|_| file.sync_all());
    drop(file);

    let commit_result = match sync_result {
        Err(error) => Err(CommandError::io(format!("同步事务临时文件失败：{error}"))),
        Ok(()) => commit_staged_file(&temporary_path, &target, &expected_revision),
    };

    if commit_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    commit_result
}

fn commit_staged_file(
    temporary_path: &Path,
    target: &Path,
    expected_revision: &str,
) -> Result<FileWriteTransactionCommit, CommandError> {
    ensure_expected_revision(target, expected_revision)?;

    replace_existing_file(temporary_path, target)
        .map_err(|error| CommandError::io(format!("无法原子替换文件：{error}")))?;

    if let Some(parent) = target.parent() {
        if let Err(error) = sync_parent_directory(parent) {
            log::warn!(
                "事务写入已通过 rename 提交，但无法同步父目录 {}：{}",
                parent.display(),
                error
            );
        }
    }

    let metadata = fs::metadata(target)
        .map_err(|error| CommandError::io(format!("无法读取写入后的文件元数据：{error}")))?;
    let revision = FileRevision::from_metadata(&metadata)?;
    Ok(FileWriteTransactionCommit {
        revision: revision
            .revision
            .ok_or_else(|| CommandError::io("写入后的文件缺少 revision"))?,
        size: revision.size.unwrap_or_default(),
        modified_ms: revision.modified_ms.unwrap_or_default(),
    })
}

/// 中止事务并删除临时文件；未提交的内容不会影响磁盘上的原文件。
pub fn abort_file_transaction(
    registry: &FileTransactionRegistry,
    transaction_id: &str,
) -> Result<FileWriteTransactionAbort, CommandError> {
    let transaction = registry.lock()?.remove(transaction_id);
    let Some(transaction) = transaction else {
        return Ok(FileWriteTransactionAbort { aborted: false });
    };

    drop(transaction.file);
    let _ = fs::remove_file(&transaction.temporary_path);
    Ok(FileWriteTransactionAbort { aborted: true })
}

fn ensure_expected_revision(path: &Path, expected_revision: &str) -> Result<(), CommandError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => CommandError::new("FILE_NOT_FOUND", "目标文件不存在"),
        _ => CommandError::io(format!("无法读取文件元数据：{error}")),
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(CommandError::new("NOT_A_FILE", "目标路径不是普通文件"));
    }

    let current = FileRevision::from_metadata(&metadata)?;
    if current.revision.as_deref() != Some(expected_revision) {
        return Err(CommandError::new("FILE_CONFLICT", "文件已被外部修改"));
    }
    Ok(())
}

fn create_transaction_id() -> String {
    let counter = NEXT_TRANSACTION_ID.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{nanos:x}-{counter:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::WorkspaceRegistry;
    use tempfile::TempDir;

    fn setup() -> (TempDir, WorkspaceRegistry, FileTransactionRegistry, String) {
        let temp_dir = TempDir::new().expect("temporary workspace");
        let target = temp_dir.path().join("notes.md");
        fs::write(&target, "original").expect("write initial content");

        let workspace_registry = WorkspaceRegistry::default();
        let workspace = crate::commands::resolve_workspace_for_registry(
            &workspace_registry,
            temp_dir.path().to_str().expect("workspace path"),
        )
        .expect("resolve workspace");

        (
            temp_dir,
            workspace_registry,
            FileTransactionRegistry::default(),
            workspace.workspace_id,
        )
    }

    fn current_revision(path: &Path) -> String {
        let metadata = fs::metadata(path).expect("metadata");
        FileRevision::from_metadata(&metadata)
            .expect("revision")
            .revision
            .expect("revision value")
    }

    #[test]
    fn commits_multi_chunk_content_and_returns_new_revision() {
        let (temp_dir, workspace_registry, registry, workspace_id) = setup();
        let target = temp_dir.path().join("notes.md");
        let revision = current_revision(&target);

        let handle = begin_file_transaction(
            &registry,
            &workspace_registry,
            &workspace_id,
            "notes.md",
            &revision,
        )
        .expect("begin transaction");
        assert_eq!(handle.expected_revision, revision);

        append_file_transaction_chunk(&registry, &handle.transaction_id, "第一段-")
            .expect("append first chunk");
        let progress = append_file_transaction_chunk(&registry, &handle.transaction_id, "第二段")
            .expect("append second chunk");
        assert!(progress.bytes_written > 0);

        let commit =
            commit_file_transaction(&registry, &handle.transaction_id).expect("commit transaction");
        assert_ne!(commit.revision, revision);
        assert_eq!(
            fs::read_to_string(&target).expect("read target"),
            "第一段-第二段"
        );
        assert_eq!(commit.size, fs::metadata(&target).expect("metadata").len());
    }

    #[test]
    fn rejects_commit_when_file_changed_after_begin_and_keeps_disk_content() {
        let (temp_dir, workspace_registry, registry, workspace_id) = setup();
        let target = temp_dir.path().join("notes.md");
        let revision = current_revision(&target);

        let handle = begin_file_transaction(
            &registry,
            &workspace_registry,
            &workspace_id,
            "notes.md",
            &revision,
        )
        .expect("begin transaction");
        append_file_transaction_chunk(&registry, &handle.transaction_id, "local edit")
            .expect("append chunk");

        fs::write(&target, "external edit").expect("external write");

        let error = commit_file_transaction(&registry, &handle.transaction_id)
            .expect_err("commit must fail");
        assert_eq!(error.code, "FILE_CONFLICT");
        assert_eq!(
            fs::read_to_string(&target).expect("read target"),
            "external edit"
        );
        assert!(
            fs::read_dir(temp_dir.path())
                .expect("list directory")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")),
            "冲突提交后不应残留临时文件"
        );
    }

    #[test]
    fn rejects_begin_with_stale_revision() {
        let (_temp_dir, workspace_registry, registry, workspace_id) = setup();

        let error = begin_file_transaction(
            &registry,
            &workspace_registry,
            &workspace_id,
            "notes.md",
            "1:1",
        )
        .expect_err("begin must fail");
        assert_eq!(error.code, "FILE_CONFLICT");
    }

    #[test]
    fn abort_removes_temporary_file_and_keeps_target() {
        let (temp_dir, workspace_registry, registry, workspace_id) = setup();
        let target = temp_dir.path().join("notes.md");
        let revision = current_revision(&target);

        let handle = begin_file_transaction(
            &registry,
            &workspace_registry,
            &workspace_id,
            "notes.md",
            &revision,
        )
        .expect("begin transaction");
        append_file_transaction_chunk(&registry, &handle.transaction_id, "discarded")
            .expect("append chunk");

        let abort = abort_file_transaction(&registry, &handle.transaction_id).expect("abort");
        assert!(abort.aborted);
        assert_eq!(
            fs::read_to_string(&target).expect("read target"),
            "original"
        );
        assert_eq!(
            abort_file_transaction(&registry, &handle.transaction_id)
                .expect("second abort")
                .aborted,
            false
        );
        assert!(
            fs::read_dir(temp_dir.path())
                .expect("list directory")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")),
            "中止后不应残留临时文件"
        );
    }

    #[test]
    fn rejects_chunk_larger_than_limit() {
        let (temp_dir, workspace_registry, registry, workspace_id) = setup();
        let revision = current_revision(&temp_dir.path().join("notes.md"));

        let handle = begin_file_transaction(
            &registry,
            &workspace_registry,
            &workspace_id,
            "notes.md",
            &revision,
        )
        .expect("begin transaction");

        let oversized = "a".repeat(MAX_TRANSACTION_CHUNK_BYTES as usize + 1);
        let error = append_file_transaction_chunk(&registry, &handle.transaction_id, &oversized)
            .expect_err("chunk must be rejected");
        assert_eq!(error.code, "CHUNK_TOO_LARGE");

        abort_file_transaction(&registry, &handle.transaction_id).expect("abort");
    }

    #[test]
    fn purges_expired_transactions_and_removes_temp_file() {
        let (temp_dir, workspace_registry, registry, workspace_id) = setup();
        let target = temp_dir.path().join("notes.md");
        let revision = current_revision(&target);

        let handle = begin_file_transaction(
            &registry,
            &workspace_registry,
            &workspace_id,
            "notes.md",
            &revision,
        )
        .expect("begin transaction");

        let purged = registry.purge_expired(
            Instant::now() + Duration::from_secs(3600),
            Duration::from_secs(60),
        );
        assert_eq!(purged, 1);
        assert_eq!(
            abort_file_transaction(&registry, &handle.transaction_id)
                .expect("abort")
                .aborted,
            false
        );
        assert!(
            fs::read_dir(temp_dir.path())
                .expect("list directory")
                .all(|entry| !entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")),
            "超时清理后不应残留临时文件"
        );
    }

    #[test]
    fn rejects_transaction_that_is_not_registered() {
        let registry = FileTransactionRegistry::default();
        let error = append_file_transaction_chunk(&registry, "txn-missing", "content")
            .expect_err("append must fail");
        assert_eq!(error.code, "TRANSACTION_NOT_FOUND");
    }
}
