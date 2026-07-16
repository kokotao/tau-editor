/**
 * @description Workspace Runtime 的安全路径、revision 与条件写入契约测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 10:00
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{
    get_file_revision_for_registry, resolve_workspace_for_registry,
    write_file_if_revision_for_registry, WorkspaceRegistry,
};

#[test]
fn resolves_a_canonical_workspace_and_uses_an_opaque_runtime_id() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    let registry = WorkspaceRegistry::default();

    let resolved =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");

    assert!(!resolved.workspace_id.is_empty());
    assert_ne!(resolved.workspace_id, temp_dir.path().to_string_lossy());
    assert_eq!(
        std::path::PathBuf::from(resolved.root_path),
        temp_dir
            .path()
            .canonicalize()
            .expect("canonical temporary workspace"),
    );
}

#[test]
fn rejects_empty_traversal_nul_and_symlink_escape_paths() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    let outside_dir = TempDir::new().expect("outside directory");
    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");

    let empty = get_file_revision_for_registry(&registry, &workspace.workspace_id, "", false)
        .expect_err("empty relative path must fail");
    assert_eq!(empty.code, "PATH_OUTSIDE_WORKSPACE");

    let traversal =
        get_file_revision_for_registry(&registry, &workspace.workspace_id, "../secret.txt", false)
            .expect_err("parent traversal must fail");
    assert_eq!(traversal.code, "PATH_OUTSIDE_WORKSPACE");

    let nul =
        get_file_revision_for_registry(&registry, &workspace.workspace_id, "bad\0name", false)
            .expect_err("NUL path must fail");
    assert_eq!(nul.code, "PATH_OUTSIDE_WORKSPACE");

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside_dir.path(), temp_dir.path().join("escape"))
            .expect("create symlink");
        let symlink_escape = get_file_revision_for_registry(
            &registry,
            &workspace.workspace_id,
            "escape/secret.txt",
            false,
        )
        .expect_err("symlink escape must fail");
        assert_eq!(symlink_escape.code, "SYMLINK_ESCAPE");
    }
}

#[test]
fn reports_revision_and_refuses_stale_conditional_write_without_changing_content() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    let document = temp_dir.path().join("document.txt");
    fs::write(&document, "before").expect("write initial content");

    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");
    let revision =
        get_file_revision_for_registry(&registry, &workspace.workspace_id, "document.txt", false)
            .expect("revision available");

    assert!(revision.exists);
    assert_eq!(revision.size, Some(6));
    assert!(revision
        .revision
        .as_deref()
        .is_some_and(|value| value.contains(':')));

    fs::write(&document, "changed externally").expect("external mutation");
    let conflict = write_file_if_revision_for_registry(
        &registry,
        &workspace.workspace_id,
        "document.txt",
        "replacement",
        revision.revision.as_deref().expect("revision"),
    )
    .expect_err("stale revision must conflict");

    assert_eq!(conflict.code, "FILE_CONFLICT");
    assert_eq!(
        fs::read_to_string(&document).expect("read document"),
        "changed externally"
    );
}

#[test]
fn conditionally_writes_with_current_revision_and_returns_a_new_revision() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    let document = temp_dir.path().join("document.txt");
    fs::write(&document, "before").expect("write initial content");

    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");
    let previous =
        get_file_revision_for_registry(&registry, &workspace.workspace_id, "document.txt", false)
            .expect("revision available");

    let written = write_file_if_revision_for_registry(
        &registry,
        &workspace.workspace_id,
        "document.txt",
        "after",
        previous.revision.as_deref().expect("revision"),
    )
    .expect("conditional write succeeds");

    assert_eq!(
        fs::read_to_string(&document).expect("read document"),
        "after"
    );
    assert_ne!(
        written.revision,
        previous.revision.expect("previous revision")
    );
}
