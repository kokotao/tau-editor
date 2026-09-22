/**
 * @description Markdown 资产导入、链接校验与工作区任务聚合的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 07:15
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{
    check_markdown_links_for_registry, collect_workspace_tasks_for_registry,
    import_markdown_asset_for_registry, resolve_workspace_for_registry, WorkspaceRegistry,
};

fn prepare_workspace() -> (TempDir, WorkspaceRegistry, String) {
    let temp_dir = TempDir::new().expect("temporary workspace");
    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");
    (temp_dir, registry, workspace.workspace_id)
}

#[test]
fn imports_an_image_next_to_the_document_and_reuses_identical_content() {
    let (temp_dir, registry, workspace_id) = prepare_workspace();
    fs::create_dir(temp_dir.path().join("notes")).expect("create notes folder");
    fs::write(temp_dir.path().join("notes/doc.md"), "# Doc\n").expect("write document");

    let source_dir = TempDir::new().expect("source folder");
    let source = source_dir.path().join("my logo.png");
    fs::write(&source, b"png-bytes").expect("write source image");

    let imported = import_markdown_asset_for_registry(
        &registry,
        &workspace_id,
        "notes/doc.md",
        source.to_string_lossy().as_ref(),
    )
    .expect("import succeeds");

    assert_eq!(imported.relative_path, "assets/my-logo.png");
    assert_eq!(imported.markdown_snippet, "![my-logo](assets/my-logo.png)");
    assert!(!imported.reused_existing);
    assert_eq!(imported.bytes, 9);
    assert_eq!(
        fs::read(temp_dir.path().join("notes/assets/my-logo.png")).expect("read imported asset"),
        b"png-bytes"
    );

    let again = import_markdown_asset_for_registry(
        &registry,
        &workspace_id,
        "notes/doc.md",
        source.to_string_lossy().as_ref(),
    )
    .expect("second import succeeds");
    assert!(again.reused_existing);
    assert_eq!(again.relative_path, "assets/my-logo.png");

    fs::write(&source, b"different-bytes").expect("rewrite source image");
    let renamed = import_markdown_asset_for_registry(
        &registry,
        &workspace_id,
        "notes/doc.md",
        source.to_string_lossy().as_ref(),
    )
    .expect("third import succeeds");
    assert_eq!(renamed.relative_path, "assets/my-logo-1.png");
}

#[test]
fn rejects_unsupported_asset_types() {
    let (temp_dir, registry, workspace_id) = prepare_workspace();
    fs::write(temp_dir.path().join("doc.md"), "# Doc\n").expect("write document");

    let source_dir = TempDir::new().expect("source folder");
    let source = source_dir.path().join("notes.txt");
    fs::write(&source, b"text").expect("write source file");

    let error = import_markdown_asset_for_registry(
        &registry,
        &workspace_id,
        "doc.md",
        source.to_string_lossy().as_ref(),
    )
    .expect_err("unsupported asset rejected");

    assert_eq!(error.code, "ASSET_TYPE_UNSUPPORTED");
}

#[test]
fn classifies_relative_external_outside_and_missing_links() {
    let (temp_dir, registry, workspace_id) = prepare_workspace();
    fs::create_dir(temp_dir.path().join("docs")).expect("create docs folder");
    fs::create_dir(temp_dir.path().join("shared")).expect("create shared folder");
    fs::write(temp_dir.path().join("docs/notes.md"), "# Notes\n").expect("write document");
    fs::write(temp_dir.path().join("docs/other.md"), "# Other\n").expect("write sibling");
    fs::write(temp_dir.path().join("shared/pic.png"), b"png").expect("write image");

    let targets = vec![
        "other.md".to_string(),
        "#section".to_string(),
        "https://example.com".to_string(),
        "../shared/pic.png".to_string(),
        "../../escape.md".to_string(),
        "missing.md".to_string(),
        "/etc/passwd".to_string(),
    ];

    let statuses = check_markdown_links_for_registry(
        &registry,
        &workspace_id,
        "docs/notes.md",
        &targets,
    )
    .expect("link check succeeds");

    assert_eq!(statuses.len(), 7);
    assert_eq!(statuses[0].status, "ok");
    assert_eq!(
        statuses[0].resolved_relative_path.as_deref(),
        Some("docs/other.md")
    );
    assert_eq!(statuses[1].status, "anchor");
    assert_eq!(statuses[2].status, "external");
    assert_eq!(statuses[3].status, "ok");
    assert_eq!(
        statuses[3].resolved_relative_path.as_deref(),
        Some("shared/pic.png")
    );
    assert_eq!(statuses[4].status, "outside");
    assert_eq!(statuses[5].status, "missing");
    assert_eq!(statuses[6].status, "unsupported");
}

#[test]
fn aggregates_tasks_while_ignoring_code_fences_and_other_files() {
    let (temp_dir, registry, workspace_id) = prepare_workspace();
    fs::create_dir(temp_dir.path().join("docs")).expect("create docs folder");
    fs::write(
        temp_dir.path().join("docs/a.md"),
        "# Tasks\n- [ ] first\n- [x] done\n\n```md\n- [ ] inside fence\n```\n\n1. [ ] ordered\n",
    )
    .expect("write markdown");
    fs::write(temp_dir.path().join("docs/b.md"), "# No tasks\n").expect("write markdown");
    fs::write(temp_dir.path().join("docs/c.txt"), "- [ ] not markdown\n").expect("write text");

    let response = collect_workspace_tasks_for_registry(&registry, &workspace_id)
        .expect("task collection succeeds");

    assert_eq!(response.total_tasks, 3);
    assert_eq!(response.files.len(), 1);
    assert_eq!(response.files[0].relative_path, "docs/a.md");

    let labels: Vec<&str> = response.files[0]
        .tasks
        .iter()
        .map(|task| task.label.as_str())
        .collect();
    assert_eq!(labels, vec!["first", "done", "ordered"]);
    assert!(!response.files[0].tasks[0].completed);
    assert!(response.files[0].tasks[1].completed);
    assert_eq!(response.files[0].tasks[2].line, 9);
    assert!(!response.truncated);
}
