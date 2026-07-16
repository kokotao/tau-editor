/**
 * @description Workspace Git 状态与差异命令的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 12:52
 */
use std::fs;
use std::process::Command;

use tempfile::TempDir;
use text_editor_lib::{git_status_for_registry, resolve_workspace_for_registry, WorkspaceRegistry};

#[test]
fn reports_modified_files_for_a_resolved_workspace_repository() {
    let temp_dir = TempDir::new().expect("temporary repository");
    Command::new("git")
        .args(["init", "--quiet"])
        .current_dir(temp_dir.path())
        .status()
        .expect("git available")
        .success()
        .then_some(())
        .expect("git init succeeds");
    fs::write(temp_dir.path().join("notes.md"), "draft").expect("write document");

    let registry = WorkspaceRegistry::default();
    let workspace = resolve_workspace_for_registry(
        &registry,
        temp_dir.path().to_string_lossy().as_ref(),
    )
    .expect("workspace resolves");

    let status = git_status_for_registry(&registry, &workspace.workspace_id)
        .expect("git status succeeds");

    assert!(status.entries.iter().any(|entry| entry.path == "notes.md"));
}
