/**
 * @description Workspace 内容搜索命令的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:00
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{search_workspace_for_registry, resolve_workspace_for_registry, SearchOptions, WorkspaceRegistry};

#[test]
fn searches_text_and_regular_expressions_while_skipping_ignored_directories() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    fs::create_dir(temp_dir.path().join("src")).expect("create source folder");
    fs::create_dir(temp_dir.path().join("node_modules")).expect("create ignored folder");
    fs::write(temp_dir.path().join("src/app.ts"), "export const release = 'v0.3.0';\n")
        .expect("write source");
    fs::write(temp_dir.path().join("README.md"), "Release v0.3.0\n")
        .expect("write readme");
    fs::write(temp_dir.path().join("node_modules/ignored.js"), "release v0.3.0")
        .expect("write ignored file");

    let registry = WorkspaceRegistry::default();
    let workspace = resolve_workspace_for_registry(
        &registry,
        temp_dir.path().to_string_lossy().as_ref(),
    )
    .expect("workspace resolves");

    let response = search_workspace_for_registry(
        &registry,
        &workspace.workspace_id,
        "v0\\.3\\.0",
        SearchOptions { is_regex: true, case_sensitive: false, whole_word: false, max_results: 50 },
    )
    .expect("search succeeds");

    assert_eq!(response.matches.len(), 2);
    assert!(response.matches.iter().any(|item| item.path == "src/app.ts" && item.line == 1));
    assert!(response.matches.iter().all(|item| !item.path.contains("node_modules")));
}
