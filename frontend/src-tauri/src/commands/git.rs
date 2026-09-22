/**
 * @description 受 WorkspaceId 边界约束的 Git 状态命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 12:53
 */
use std::path::{Component, Path};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use tauri::State;

use crate::commands::{workspace_root_for_registry, WorkspaceRegistry};
use crate::models::{CommandError, GitStatusEntry, GitStatusResponse};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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

/**
 * @description 读取指定 revision 下的文件内容，用于 Diff 视图左侧基准版本
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 18:05
 */
#[tauri::command]
pub fn git_show_file(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_path: String,
    revision: Option<String>,
) -> Result<String, CommandError> {
    git_show_file_for_registry(
        registry.inner(),
        &workspace_id,
        &relative_path,
        revision.as_deref().unwrap_or("HEAD"),
    )
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
    let entries = lines.filter_map(parse_status_line).collect::<Vec<_>>();

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
    let mut args = vec![
        "-C".to_string(),
        root.to_string_lossy().into_owned(),
        "diff".to_string(),
    ];
    if staged {
        args.push("--cached".to_string());
    }
    args.push("--".to_string());
    args.push(relative_path.to_string());
    let output = run_git(&args)?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// 读取 revision:path 内容；revision 仅允许安全字符，避免参数注入。
pub fn git_show_file_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    revision: &str,
) -> Result<String, CommandError> {
    validate_relative_path(relative_path)?;
    if revision.is_empty()
        || !revision
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '_' | '-' | '.' | '~' | '^' | '@' | '{' | '}'))
    {
        return Err(CommandError::new("GIT_REVISION_INVALID", "Git revision 无效"));
    }

    let root = workspace_root_for_registry(registry, workspace_id)?;
    let spec = format!("{revision}:{relative_path}");
    let output = run_git(&[
        "-C".to_string(),
        root.to_string_lossy().into_owned(),
        "show".to_string(),
        spec,
    ])
    .map_err(|error| {
        if error.code == "GIT_OPERATION_FAILED" {
            CommandError::new(
                "GIT_FILE_NOT_IN_REVISION",
                format!("{relative_path} 在 {revision} 中不存在"),
            )
        } else {
            error
        }
    })?;

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
    let mut args = vec![
        "-C".to_string(),
        root.to_string_lossy().into_owned(),
        "add".to_string(),
        "--".to_string(),
    ];
    args.extend(relative_paths.iter().cloned());
    run_git(&args)?;
    Ok(())
}

pub fn git_unstage_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_paths: &[String],
) -> Result<(), CommandError> {
    run_git_for_paths(
        registry,
        workspace_id,
        &["reset", "HEAD", "--"],
        relative_paths,
    )
}

pub fn git_discard_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_paths: &[String],
) -> Result<(), CommandError> {
    run_git_for_paths(
        registry,
        workspace_id,
        &["restore", "--worktree", "--"],
        relative_paths,
    )
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
    let mut command = Command::new("git");
    command.args(args);
    // Windows 下 GUI 进程调用 git 同样会弹出控制台窗口，沿用 v0.3.2 的抑制策略。
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
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
    if candidate.is_absolute()
        || candidate.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(CommandError::new(
            "PATH_OUTSIDE_WORKSPACE",
            "Git 路径必须是工作区内相对路径",
        ));
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
    Some(GitStatusEntry {
        path,
        index_status,
        worktree_status,
    })
}
