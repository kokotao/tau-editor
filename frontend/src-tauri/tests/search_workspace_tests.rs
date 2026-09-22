/**
 * @description Workspace 内容搜索命令的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:00
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{
    resolve_workspace_for_registry, search_workspace_for_registry, SearchOptions, WorkspaceRegistry,
};
use text_editor_lib::{
    cancel_search_for_registry, search_workspace_cancellable, search_workspace_with_session,
    SearchCancellation, SearchSessionRegistry,
};

#[test]
fn searches_text_and_regular_expressions_while_skipping_ignored_directories() {
    let temp_dir = TempDir::new().expect("temporary workspace");
    fs::create_dir(temp_dir.path().join("src")).expect("create source folder");
    fs::create_dir(temp_dir.path().join("node_modules")).expect("create ignored folder");
    fs::write(
        temp_dir.path().join("src/app.ts"),
        "export const release = 'v0.3.0';\n",
    )
    .expect("write source");
    fs::write(temp_dir.path().join("README.md"), "Release v0.3.0\n").expect("write readme");
    fs::write(
        temp_dir.path().join("node_modules/ignored.js"),
        "release v0.3.0",
    )
    .expect("write ignored file");

    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");

    let response = search_workspace_for_registry(
        &registry,
        &workspace.workspace_id,
        "v0\\.3\\.0",
        SearchOptions {
            is_regex: true,
            case_sensitive: false,
            whole_word: false,
            max_results: 50,
        },
    )
    .expect("search succeeds");

    assert_eq!(response.matches.len(), 2);
    assert!(response
        .matches
        .iter()
        .any(|item| item.path == "src/app.ts" && item.line == 1));
    assert!(response
        .matches
        .iter()
        .all(|item| !item.path.contains("node_modules")));
}

fn search_options(max_results: usize) -> SearchOptions {
    SearchOptions {
        is_regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results,
    }
}

fn prepare_workspace(file_count: usize) -> (TempDir, WorkspaceRegistry, String) {
    let temp_dir = TempDir::new().expect("temporary workspace");
    for index in 0..file_count {
        fs::write(
            temp_dir.path().join(format!("notes-{index}.txt")),
            "needle in file\n",
        )
        .expect("write note");
    }

    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");
    (temp_dir, registry, workspace.workspace_id)
}

#[test]
fn cancelled_search_stops_early_and_reports_cancelled() {
    let (_temp_dir, registry, workspace_id) = prepare_workspace(20);
    let cancellation = SearchCancellation::default();
    cancellation.cancel();

    let response = search_workspace_cancellable(
        &registry,
        &workspace_id,
        "needle",
        search_options(200),
        &cancellation,
    )
    .expect("search succeeds");

    assert!(response.cancelled);
    assert!(response.matches.len() < 20);
}

#[test]
fn search_session_registry_rejects_duplicate_and_expired_ids() {
    let sessions = SearchSessionRegistry::default();

    let cancellation = sessions.begin("search-a").expect("begin search");
    assert!(!cancellation.is_cancelled());

    let duplicate = sessions.begin("search-a").expect_err("duplicate rejected");
    assert_eq!(duplicate.code, "SEARCH_IN_PROGRESS");

    let expired = cancel_search_for_registry(&sessions, "missing")
        .expect_err("unknown search id rejected");
    assert_eq!(expired.code, "SEARCH_EXPIRED");

    sessions.finish("search-a");
    let reused = sessions.begin("search-a").expect("search id reusable");
    reused.cancel();
    assert!(reused.is_cancelled());
}

#[test]
fn search_through_session_registry_releases_session_when_finished() {
    let (_temp_dir, registry, workspace_id) = prepare_workspace(3);
    let sessions = SearchSessionRegistry::default();

    let response = search_workspace_with_session(
        &registry,
        &sessions,
        &workspace_id,
        "search-finished",
        "needle",
        search_options(200),
    )
    .expect("search succeeds");

    assert!(!response.cancelled);
    assert_eq!(response.matches.len(), 3);

    let expired = cancel_search_for_registry(&sessions, "search-finished")
        .expect_err("finished search is no longer cancellable");
    assert_eq!(expired.code, "SEARCH_EXPIRED");
}
