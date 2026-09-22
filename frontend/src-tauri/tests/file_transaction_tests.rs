/**
 * @description 大文件分段写入事务契约测试：超过 4MiB 的 revision 安全提交、冲突保护与中止清理
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:52
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{
    abort_file_transaction, append_file_transaction_chunk, begin_file_transaction,
    commit_file_transaction, get_file_revision_for_registry, resolve_workspace_for_registry,
    FileTransactionRegistry, WorkspaceRegistry, MAX_TRANSACTION_CHUNK_BYTES,
};

const MIB: usize = 1024 * 1024;

fn setup() -> (TempDir, WorkspaceRegistry, FileTransactionRegistry, String) {
    let temp_dir = TempDir::new().expect("temporary workspace");
    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");

    (
        temp_dir,
        registry,
        FileTransactionRegistry::default(),
        workspace.workspace_id,
    )
}

fn chunk(content: &str) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < content.len() {
        let end = (start + MAX_TRANSACTION_CHUNK_BYTES as usize).min(content.len());
        chunks.push(content[start..end].to_string());
        start = end;
    }
    chunks
}

#[test]
fn commits_content_larger_than_the_direct_write_limit() {
    let (temp_dir, workspace_registry, transactions, workspace_id) = setup();
    let target = temp_dir.path().join("large.txt");
    let content = "a".repeat(4 * MIB + 11);
    fs::write(&target, "seed").expect("seed file");

    let revision =
        get_file_revision_for_registry(&workspace_registry, &workspace_id, "large.txt", false)
            .expect("revision")
            .revision
            .expect("revision value");

    let handle = begin_file_transaction(
        &transactions,
        &workspace_registry,
        &workspace_id,
        "large.txt",
        &revision,
    )
    .expect("begin transaction");

    // 事务进行中只应存在被监听层忽略的 .tmp 临时文件，不能提前改动目标文件。
    let temporary_files: Vec<String> = fs::read_dir(temp_dir.path())
        .expect("list directory")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name.ends_with(".tmp"))
        .collect();
    assert_eq!(temporary_files.len(), 1, "事务应使用单个临时文件");
    assert_eq!(
        fs::read_to_string(&target).expect("read target"),
        "seed",
        "提交前不得改动目标文件"
    );

    for piece in chunk(&content) {
        append_file_transaction_chunk(&transactions, &handle.transaction_id, &piece)
            .expect("append chunk");
    }

    let commit = commit_file_transaction(&transactions, &handle.transaction_id).expect("commit");
    let written = fs::read_to_string(&target).expect("read target");
    assert_eq!(written.len(), content.len());
    assert_eq!(written, content);
    assert_ne!(commit.revision, revision);
    assert_eq!(commit.size, content.len() as u64);
    assert!(
        fs::read_dir(temp_dir.path())
            .expect("list directory")
            .all(|entry| !entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .ends_with(".tmp")),
        "提交后不应残留临时文件"
    );
}

#[test]
fn refuses_to_commit_when_the_file_changed_during_the_transaction() {
    let (temp_dir, workspace_registry, transactions, workspace_id) = setup();
    let target = temp_dir.path().join("notes.md");
    fs::write(&target, "seed").expect("seed file");

    let revision =
        get_file_revision_for_registry(&workspace_registry, &workspace_id, "notes.md", false)
            .expect("revision")
            .revision
            .expect("revision value");
    let handle = begin_file_transaction(
        &transactions,
        &workspace_registry,
        &workspace_id,
        "notes.md",
        &revision,
    )
    .expect("begin transaction");
    append_file_transaction_chunk(&transactions, &handle.transaction_id, "local edit")
        .expect("append chunk");

    fs::write(&target, "external edit").expect("external write");

    let error = commit_file_transaction(&transactions, &handle.transaction_id)
        .expect_err("conflicting commit must fail");
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
fn aborted_transaction_keeps_the_original_file() {
    let (temp_dir, workspace_registry, transactions, workspace_id) = setup();
    let target = temp_dir.path().join("notes.md");
    fs::write(&target, "seed").expect("seed file");

    let revision =
        get_file_revision_for_registry(&workspace_registry, &workspace_id, "notes.md", false)
            .expect("revision")
            .revision
            .expect("revision value");
    let handle = begin_file_transaction(
        &transactions,
        &workspace_registry,
        &workspace_id,
        "notes.md",
        &revision,
    )
    .expect("begin transaction");
    append_file_transaction_chunk(&transactions, &handle.transaction_id, "discarded")
        .expect("append chunk");

    assert!(
        abort_file_transaction(&transactions, &handle.transaction_id)
            .expect("abort")
            .aborted
    );
    assert_eq!(fs::read_to_string(&target).expect("read target"), "seed");
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
fn rejects_paths_outside_the_workspace() {
    let (temp_dir, workspace_registry, transactions, workspace_id) = setup();
    let target = temp_dir.path().join("notes.md");
    fs::write(&target, "seed").expect("seed file");
    let revision =
        get_file_revision_for_registry(&workspace_registry, &workspace_id, "notes.md", false)
            .expect("revision")
            .revision
            .expect("revision value");

    let error = begin_file_transaction(
        &transactions,
        &workspace_registry,
        &workspace_id,
        "../escape.md",
        &revision,
    )
    .expect_err("traversal must fail");
    assert_eq!(error.code, "PATH_OUTSIDE_WORKSPACE");
}
