/**
 * @description Workspace 安全替换命令的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:17
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{
    apply_workspace_replace_for_registry, get_file_revision_for_registry,
    resolve_workspace_for_registry, ReplaceOperation, SearchOptions, WorkspaceRegistry,
};

#[test]
fn applies_a_revision_checked_regex_replacement_to_a_selected_file() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    fs::write(temp_dir.path().join("notes.md"), "release v0.2.6\nrelease v0.2.6\n")
        .expect("write document");
    let registry = WorkspaceRegistry::default();
    let workspace = resolve_workspace_for_registry(
        &registry,
        temp_dir.path().to_string_lossy().as_ref(),
    )
    .expect("workspace resolves");
    let revision = get_file_revision_for_registry(&registry, &workspace.workspace_id, "notes.md", false)
        .expect("revision")
        .revision
        .expect("revision value");

    let result = apply_workspace_replace_for_registry(
        &registry,
        &workspace.workspace_id,
        &[ReplaceOperation {
            relative_path: "notes.md".to_string(),
            expected_revision: revision,
            query: r"v0\.2\.6".to_string(),
            replacement: "v0.3.0".to_string(),
            options: SearchOptions { is_regex: true, case_sensitive: true, whole_word: false, max_results: 20 },
        }],
    )
    .expect("replace succeeds");

    assert_eq!(result.changed.len(), 1);
    assert_eq!(fs::read_to_string(temp_dir.path().join("notes.md")).expect("read document"), "release v0.3.0\nrelease v0.3.0\n");
}
