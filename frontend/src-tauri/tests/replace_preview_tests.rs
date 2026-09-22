/**
 * @description Workspace 替换预览、按计划提交与撤销的回归测试
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 00:40
 */
use std::fs;

use tempfile::TempDir;
use text_editor_lib::{
    apply_replace_preview, create_replace_preview, resolve_workspace_for_registry, undo_replace,
    ReplacePreviewRegistry, SearchOptions, WorkspaceRegistry,
};

fn search_options() -> SearchOptions {
    SearchOptions {
        is_regex: false,
        case_sensitive: true,
        whole_word: false,
        max_results: 200,
    }
}

fn prepare_workspace(content: &str) -> (TempDir, WorkspaceRegistry, String) {
    let temp_dir = TempDir::new().expect("temporary workspace");
    fs::write(temp_dir.path().join("notes.md"), content).expect("write document");

    let registry = WorkspaceRegistry::default();
    let workspace =
        resolve_workspace_for_registry(&registry, temp_dir.path().to_string_lossy().as_ref())
            .expect("workspace resolves");
    (temp_dir, registry, workspace.workspace_id)
}

fn read_notes(temp_dir: &TempDir) -> String {
    fs::read_to_string(temp_dir.path().join("notes.md")).expect("read document")
}

#[test]
fn preview_lists_non_overlapping_matches_and_applies_only_selected_items() {
    let original = "release v0.2.6\nkeep release v0.2.6\n";
    let (temp_dir, registry, workspace_id) = prepare_workspace(original);
    let previews = ReplacePreviewRegistry::default();

    let preview = create_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        "release",
        "RELEASE",
        &search_options(),
    )
    .expect("preview succeeds");

    assert_eq!(preview.total_matches, 2);
    assert_eq!(preview.files.len(), 1);
    assert_eq!(preview.files[0].matches.len(), 2);
    assert_eq!(preview.files[0].matches[0].match_id, "notes.md#0");
    assert_eq!(preview.files[0].matches[1].match_id, "notes.md#1");
    assert_eq!(preview.files[0].matches[0].line, 1);
    assert_eq!(preview.files[0].matches[0].column, 1);
    assert_eq!(preview.files[0].matches[0].after, "RELEASE v0.2.6");
    assert!(!preview.truncated);

    let selected = vec![preview.files[0].matches[0].match_id.clone()];
    let applied = apply_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        &preview.preview_id,
        &selected,
    )
    .expect("apply succeeds");

    assert_eq!(applied.applied, 1);
    assert_eq!(applied.conflicts, 0);
    assert_eq!(applied.failed, 0);
    assert!(applied.undo_id.is_some());
    assert_eq!(read_notes(&temp_dir), "RELEASE v0.2.6\nkeep release v0.2.6\n");

    let undo_id = applied.undo_id.expect("undo id");
    let undone = undo_replace(&previews, &registry, &workspace_id, &undo_id).expect("undo succeeds");

    assert_eq!(undone.restored, vec!["notes.md".to_string()]);
    assert!(undone.conflicts.is_empty());
    assert!(undone.failed.is_empty());
    assert_eq!(read_notes(&temp_dir), original);
}

#[test]
fn apply_skips_files_changed_after_preview_and_consumes_preview_id() {
    let (temp_dir, registry, workspace_id) = prepare_workspace("release v0.2.6\n");
    let previews = ReplacePreviewRegistry::default();

    let preview = create_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        "release",
        "RELEASE",
        &search_options(),
    )
    .expect("preview succeeds");
    let match_ids = vec![preview.files[0].matches[0].match_id.clone()];

    fs::write(temp_dir.path().join("notes.md"), "release v0.2.6\n外部改动\n").expect("external edit");

    let applied = apply_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        &preview.preview_id,
        &match_ids,
    )
    .expect("apply returns per-file result");

    assert_eq!(applied.applied, 0);
    assert_eq!(applied.conflicts, 1);
    assert_eq!(applied.results[0].status, "conflict");
    assert_eq!(read_notes(&temp_dir), "release v0.2.6\n外部改动\n");

    let reused = apply_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        &preview.preview_id,
        &match_ids,
    )
    .expect_err("preview id is single use");
    assert_eq!(reused.code, "PREVIEW_EXPIRED");
}

#[test]
fn apply_rejects_unknown_match_ids_and_reports_expired_undo() {
    let (temp_dir, registry, workspace_id) = prepare_workspace("release v0.2.6\n");
    let previews = ReplacePreviewRegistry::default();

    let preview = create_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        "release",
        "RELEASE",
        &search_options(),
    )
    .expect("preview succeeds");

    let invalid = apply_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        &preview.preview_id,
        &["notes.md#99".to_string()],
    )
    .expect_err("unknown match id rejected");
    assert_eq!(invalid.code, "MATCH_ID_INVALID");
    assert_eq!(read_notes(&temp_dir), "release v0.2.6\n");

    let expired = undo_replace(&previews, &registry, &workspace_id, "undo-missing")
        .expect_err("missing undo id rejected");
    assert_eq!(expired.code, "UNDO_EXPIRED");
}

#[test]
fn apply_supports_multiple_matches_on_one_line_and_preserves_line_endings() {
    let (temp_dir, registry, workspace_id) = prepare_workspace("a a a\r\nb\r\n");
    let previews = ReplacePreviewRegistry::default();

    let preview = create_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        "a",
        "x",
        &search_options(),
    )
    .expect("preview succeeds");
    assert_eq!(preview.total_matches, 3);

    let all: Vec<String> = preview.files[0]
        .matches
        .iter()
        .map(|item| item.match_id.clone())
        .collect();
    let applied = apply_replace_preview(
        &previews,
        &registry,
        &workspace_id,
        &preview.preview_id,
        &all,
    )
    .expect("apply succeeds");

    assert_eq!(applied.applied, 1);
    assert_eq!(read_notes(&temp_dir), "x x x\r\nb\r\n");
}
