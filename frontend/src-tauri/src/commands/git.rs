/**
 * @description 受 WorkspaceId 边界约束的 Git 状态命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 12:53
 */
use std::process::Command;

use tauri::State;

use crate::commands::{workspace_root_for_registry, WorkspaceRegistry};
use crate::models::{CommandError, GitStatusEntry, GitStatusResponse};

#[tauri::command]
pub fn git_status(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
) -> Result<GitStatusResponse, CommandError> {
    git_status_for_registry(registry.inner(), &workspace_id)
}

pub fn git_status_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
) -> Result<GitStatusResponse, CommandError> {
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let output = Command::new("git")
        .args(["-C", root.to_string_lossy().as_ref(), "status", "--short", "--branch"])
        .output()
        .map_err(|error| CommandError::new("GIT_UNAVAILABLE", format!("无法启动 Git：{error}")))?;

    if !output.status.success() {
        return Err(CommandError::new(
            "GIT_REPOSITORY_NOT_FOUND",
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let branch = lines
        .next()
        .and_then(|line| line.strip_prefix("## "))
        .unwrap_or("HEAD")
        .split("...")
        .next()
        .unwrap_or("HEAD")
        .to_string();
    let entries = lines
        .filter_map(parse_status_line)
        .collect::<Vec<_>>();

    Ok(GitStatusResponse { branch, entries })
}

fn parse_status_line(line: &str) -> Option<GitStatusEntry> {
    if line.len() < 4 {
        return None;
    }
    let bytes = line.as_bytes();
    let index_status = (bytes[0] as char).to_string();
    let worktree_status = (bytes[1] as char).to_string();
    let path = line[3..].split(" -> ").last()?.to_string();
    Some(GitStatusEntry { path, index_status, worktree_status })
}
