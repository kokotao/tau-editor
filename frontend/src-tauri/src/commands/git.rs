/**
 * @description 受 WorkspaceId 边界约束的 Git 状态命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 12:53
 */
use std::path::{Component, Path};
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

#[tauri::command]
pub fn git_diff(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_path: String,
    staged: bool,
) -> Result<String, CommandError> {
    git_diff_for_registry(registry.inner(), &workspace_id, &relative_path, staged)
}

#[tauri::command]
pub fn git_stage(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_paths: Vec<String>,
) -> Result<(), CommandError> {
    git_stage_for_registry(registry.inner(), &workspace_id, &relative_paths)
}

#[tauri::command]
pub fn git_unstage(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_paths: Vec<String>,
) -> Result<(), CommandError> {
    git_unstage_for_registry(registry.inner(), &workspace_id, &relative_paths)
}

#[tauri::command]
pub fn git_discard(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_paths: Vec<String>,
) -> Result<(), CommandError> {
    git_discard_for_registry(registry.inner(), &workspace_id, &relative_paths)
}

pub fn git_status_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
) -> Result<GitStatusResponse, CommandError> {
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let output = run_git(&[
        "-C".to_string(),
        root.to_string_lossy().into_owned(),
        "status".to_string(),
        "--short".to_string(),
        "--branch".to_string(),
    ])
    .map_err(|error| {
        if error.code == "GIT_OPERATION_FAILED" {
            CommandError::new("GIT_REPOSITORY_NOT_FOUND", error.message)
        } else {
            error
        }
    })?;

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

pub fn git_diff_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    staged: bool,
) -> Result<String, CommandError> {
    validate_relative_path(relative_path)?;
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let mut args = vec!["-C".to_string(), root.to_string_lossy().into_owned(), "diff".to_string()];
    if staged {
        args.push("--cached".to_string());
    }
    args.push("--".to_string());
    args.push(relative_path.to_string());
    let output = run_git(&args)?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub fn git_stage_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_paths: &[String],
) -> Result<(), CommandError> {
    if relative_paths.is_empty() {
        return Ok(());
    }
    for path in relative_paths {
        validate_relative_path(path)?;
    }
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let mut args = vec!["-C".to_string(), root.to_string_lossy().into_owned(), "add".to_string(), "--".to_string()];
    args.extend(relative_paths.iter().cloned());
    run_git(&args)?;
    Ok(())
}

pub fn git_unstage_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_paths: &[String],
) -> Result<(), CommandError> {
    run_git_for_paths(registry, workspace_id, &["reset", "HEAD", "--"], relative_paths)
}

pub fn git_discard_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_paths: &[String],
) -> Result<(), CommandError> {
    run_git_for_paths(registry, workspace_id, &["restore", "--worktree", "--"], relative_paths)
}

fn run_git_for_paths(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    operation: &[&str],
    relative_paths: &[String],
) -> Result<(), CommandError> {
    if relative_paths.is_empty() {
        return Ok(());
    }
    for path in relative_paths {
        validate_relative_path(path)?;
    }
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let mut args = vec!["-C".to_string(), root.to_string_lossy().into_owned()];
    args.extend(operation.iter().map(|part| (*part).to_string()));
    args.extend(relative_paths.iter().cloned());
    run_git(&args)?;
    Ok(())
}

fn run_git(args: &[String]) -> Result<std::process::Output, CommandError> {
    let output = Command::new("git")
        .args(args)
        .output()
        .map_err(|error| CommandError::new("GIT_UNAVAILABLE", format!("无法启动 Git：{error}")))?;
    if !output.status.success() {
        return Err(CommandError::new(
            "GIT_OPERATION_FAILED",
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(output)
}

fn validate_relative_path(path: &str) -> Result<(), CommandError> {
    if path.is_empty() || path.contains('\0') {
        return Err(CommandError::new("PATH_OUTSIDE_WORKSPACE", "Git 路径无效"));
    }
    let candidate = Path::new(path);
    if candidate.is_absolute() || candidate.components().any(|part| matches!(part, Component::ParentDir | Component::RootDir | Component::Prefix(_))) {
        return Err(CommandError::new("PATH_OUTSIDE_WORKSPACE", "Git 路径必须是工作区内相对路径"));
    }
    Ok(())
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
