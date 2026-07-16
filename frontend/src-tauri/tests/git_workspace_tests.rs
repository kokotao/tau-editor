/**
 * @description Workspace Git 状态与差异命令的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 12:52
 */
use std::fs;
use std::process::Command;

use tempfile::TempDir;
use text_editor_lib::{
    git_diff_for_registry, git_discard_for_registry, git_stage_for_registry,
    git_status_for_registry, git_unstage_for_registry,
    resolve_workspace_for_registry, WorkspaceRegistry,
};

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

#[test]
fn stages_a_selected_file_and_returns_its_worktree_diff() {
    let temp_dir = TempDir::new().expect("temporary repository");
    let run_git = |args: &[&str]| {
        Command::new("git")
            .args(args)
            .current_dir(temp_dir.path())
            .status()
            .expect("git available")
            .success()
    };
    assert!(run_git(&["init", "--quiet"]));
    assert!(run_git(&["config", "user.email", "tau@example.test"]));
    assert!(run_git(&["config", "user.name", "Tau Test"]));
    fs::write(temp_dir.path().join("notes.md"), "before\n").expect("write document");
    assert!(run_git(&["add", "notes.md"]));
    assert!(run_git(&["commit", "--quiet", "-m", "initial"]));
    fs::write(temp_dir.path().join("notes.md"), "after\n").expect("modify document");

    let registry = WorkspaceRegistry::default();
    let workspace = resolve_workspace_for_registry(
        &registry,
        temp_dir.path().to_string_lossy().as_ref(),
    )
    .expect("workspace resolves");

    let diff = git_diff_for_registry(&registry, &workspace.workspace_id, "notes.md", false)
        .expect("diff succeeds");
    assert!(diff.contains("-before"));
    assert!(diff.contains("+after"));

    git_stage_for_registry(&registry, &workspace.workspace_id, &["notes.md".to_string()])
        .expect("stage succeeds");
    let status = git_status_for_registry(&registry, &workspace.workspace_id)
        .expect("status succeeds");
    let entry = status.entries.iter().find(|entry| entry.path == "notes.md").expect("entry");
    assert_eq!(entry.index_status, "M");

    git_unstage_for_registry(&registry, &workspace.workspace_id, &["notes.md".to_string()])
        .expect("unstage succeeds");
    git_discard_for_registry(&registry, &workspace.workspace_id, &["notes.md".to_string()])
        .expect("discard succeeds");
    assert_eq!(fs::read_to_string(temp_dir.path().join("notes.md")).expect("read document"), "before\n");
}
