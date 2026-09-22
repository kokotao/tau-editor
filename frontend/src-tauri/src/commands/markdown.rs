/**
 * @description Markdown 资产导入、相对链接校验与工作区任务聚合命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 07:10
 */
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::State;

use crate::commands::{
    collect_searchable_files, relative_display_path, workspace_file_path_for_registry,
    workspace_root_for_registry, WorkspaceRegistry,
};
use crate::models::{
    CommandError, ImportMarkdownAssetResponse, MarkdownLinkStatus, WorkspaceTaskFile,
    WorkspaceTaskItem, WorkspaceTaskResponse,
};
use crate::services::SearchCancellation;

const MAX_ASSET_BYTES: u64 = 10 * 1024 * 1024;
const MAX_ASSET_NAME_ATTEMPTS: usize = 50;
const ALLOWED_ASSET_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif",
];
const MAX_TASK_FILE_BYTES: u64 = 1024 * 1024;
const MAX_TASK_FILES: usize = 200;
const MAX_TASKS: usize = 500;

static NEXT_ASSET_TEMP_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub fn import_markdown_asset(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    document_relative_path: String,
    source_path: String,
) -> Result<ImportMarkdownAssetResponse, CommandError> {
    import_markdown_asset_for_registry(
        registry.inner(),
        &workspace_id,
        &document_relative_path,
        &source_path,
    )
}

#[tauri::command]
pub fn check_markdown_links(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    document_relative_path: String,
    targets: Vec<String>,
) -> Result<Vec<MarkdownLinkStatus>, CommandError> {
    check_markdown_links_for_registry(
        registry.inner(),
        &workspace_id,
        &document_relative_path,
        &targets,
    )
}

#[tauri::command]
pub fn collect_workspace_tasks(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
) -> Result<WorkspaceTaskResponse, CommandError> {
    collect_workspace_tasks_for_registry(registry.inner(), &workspace_id)
}

/// 把图片复制到文档同级 `assets/` 目录：同名同内容直接复用，避免重复导入。
pub fn import_markdown_asset_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    document_relative_path: &str,
    source_path: &str,
) -> Result<ImportMarkdownAssetResponse, CommandError> {
    let document_path =
        workspace_file_path_for_registry(registry, workspace_id, document_relative_path)?;
    let document_dir = document_path
        .parent()
        .ok_or_else(|| CommandError::new("PATH_OUTSIDE_WORKSPACE", "文档路径无效"))?;

    let source = PathBuf::from(source_path);
    let metadata = fs::symlink_metadata(&source)
        .map_err(|error| CommandError::new("ASSET_NOT_FOUND", format!("无法读取图片：{error}")))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(CommandError::new("ASSET_NOT_FILE", "请选择普通图片文件"));
    }
    if metadata.len() > MAX_ASSET_BYTES {
        return Err(CommandError::new(
            "ASSET_TOO_LARGE",
            "图片超过 10 MiB 导入上限",
        ));
    }

    let source_name = source
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .ok_or_else(|| CommandError::new("ASSET_NOT_FILE", "图片文件名无效"))?;
    let file_name = sanitize_asset_file_name(&source_name)?;
    let bytes = fs::read(&source)
        .map_err(|error| CommandError::io(format!("无法读取图片内容：{error}")))?;

    let assets_dir = document_dir.join("assets");
    fs::create_dir_all(&assets_dir)
        .map_err(|error| CommandError::io(format!("无法创建 assets 目录：{error}")))?;

    let (target_name, reused_existing) = select_asset_target(&assets_dir, &file_name, &bytes)?;
    if !reused_existing {
        write_asset_atomically(&assets_dir.join(&target_name), &bytes)?;
    }

    let relative_path = format!("assets/{target_name}");
    let alt = Path::new(&target_name)
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "image".to_string());

    Ok(ImportMarkdownAssetResponse {
        markdown_snippet: format!("![{alt}]({relative_path})"),
        relative_path,
        bytes: bytes.len() as u64,
        reused_existing,
    })
}

/// 校验 Markdown 相对链接：区分外部、锚点、绝对路径、越界与工作区内存在性。
pub fn check_markdown_links_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    document_relative_path: &str,
    targets: &[String],
) -> Result<Vec<MarkdownLinkStatus>, CommandError> {
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let document_path =
        workspace_file_path_for_registry(registry, workspace_id, document_relative_path)?;
    let document_dir = document_path
        .parent()
        .ok_or_else(|| CommandError::new("PATH_OUTSIDE_WORKSPACE", "文档路径无效"))?;

    Ok(targets
        .iter()
        .map(|target| resolve_markdown_link(&root, document_dir, target))
        .collect())
}

/// 聚合工作区内 Markdown 任务，跳过代码块与忽略目录。
pub fn collect_workspace_tasks_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
) -> Result<WorkspaceTaskResponse, CommandError> {
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let (candidates, _) = collect_searchable_files(&root, &SearchCancellation::default())?;

    let mut files = Vec::new();
    let mut total_tasks = 0usize;
    let mut scanned_files = 0usize;
    let mut truncated = false;

    for (relative_path, path) in candidates {
        if !is_markdown_file(&relative_path) {
            continue;
        }
        if files.len() >= MAX_TASK_FILES || total_tasks >= MAX_TASKS {
            truncated = true;
            break;
        }

        let Ok(metadata) = fs::metadata(&path) else {
            continue;
        };
        if metadata.len() > MAX_TASK_FILE_BYTES {
            continue;
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        scanned_files += 1;

        let remaining = MAX_TASKS - total_tasks;
        let (tasks, hit_limit) = collect_task_items(&content, remaining);
        if hit_limit {
            truncated = true;
        }
        if tasks.is_empty() {
            continue;
        }

        total_tasks += tasks.len();
        files.push(WorkspaceTaskFile {
            relative_path,
            tasks,
        });
    }

    Ok(WorkspaceTaskResponse {
        files,
        total_tasks,
        scanned_files,
        truncated,
    })
}

fn is_markdown_file(relative_path: &str) -> bool {
    let lowered = relative_path.to_lowercase();
    lowered.ends_with(".md") || lowered.ends_with(".markdown") || lowered.ends_with(".mdx")
}

fn sanitize_asset_file_name(name: &str) -> Result<String, CommandError> {
    let path = Path::new(name);
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !ALLOWED_ASSET_EXTENSIONS.contains(&extension.as_str()) {
        return Err(CommandError::new(
            "ASSET_TYPE_UNSUPPORTED",
            "仅支持 png/jpg/jpeg/gif/webp/svg/bmp/avif 图片",
        ));
    }

    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    let sanitized: String = stem
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || value == '-' || value == '_' || value == '.' {
                value
            } else {
                '-'
            }
        })
        .collect();
    let sanitized = sanitized.trim_matches(|value| value == '-' || value == '.').to_string();
    let sanitized = if sanitized.is_empty() {
        "image".to_string()
    } else {
        sanitized
    };

    Ok(format!("{sanitized}.{extension}"))
}

/// 选择目标文件名：同名同内容复用，同名不同内容递增后缀。
fn select_asset_target(
    assets_dir: &Path,
    file_name: &str,
    bytes: &[u8],
) -> Result<(String, bool), CommandError> {
    let path = Path::new(file_name);
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "image".to_string());
    let extension = path
        .extension()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();

    for index in 0..MAX_ASSET_NAME_ATTEMPTS {
        let candidate = if index == 0 {
            file_name.to_string()
        } else {
            format!("{stem}-{index}.{extension}")
        };
        let candidate_path = assets_dir.join(&candidate);

        match fs::symlink_metadata(&candidate_path) {
            Err(_) => return Ok((candidate, false)),
            Ok(_) => {
                let existing = fs::read(&candidate_path).map_err(|error| {
                    CommandError::io(format!("无法读取已有图片资产：{error}"))
                })?;
                if existing == bytes {
                    return Ok((candidate, true));
                }
            }
        }
    }

    Err(CommandError::new(
        "ASSET_NAME_CONFLICT",
        "同名图片过多，请先整理 assets 目录",
    ))
}

fn write_asset_atomically(target: &Path, bytes: &[u8]) -> Result<(), CommandError> {
    let directory = target
        .parent()
        .ok_or_else(|| CommandError::new("PATH_OUTSIDE_WORKSPACE", "图片目标路径无效"))?;
    let temp_path = directory.join(format!(
        ".tau-asset-{}-{}.tmp",
        std::process::id(),
        NEXT_ASSET_TEMP_ID.fetch_add(1, Ordering::Relaxed)
    ));

    fs::write(&temp_path, bytes)
        .map_err(|error| CommandError::io(format!("无法写入图片临时文件：{error}")))?;
    if let Err(error) = fs::rename(&temp_path, target) {
        let _ = fs::remove_file(&temp_path);
        return Err(CommandError::io(format!("无法写入图片资产：{error}")));
    }

    Ok(())
}

fn resolve_markdown_link(root: &Path, document_dir: &Path, target: &str) -> MarkdownLinkStatus {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return link_status(target, "invalid", None, Some("链接目标为空"));
    }

    let lowered = trimmed.to_lowercase();
    if lowered.starts_with("http://")
        || lowered.starts_with("https://")
        || lowered.starts_with("mailto:")
        || lowered.starts_with("tel:")
        || lowered.starts_with("data:")
    {
        return link_status(target, "external", None, None);
    }
    if lowered.starts_with("file://") {
        return link_status(target, "unsupported", None, Some("不支持 file:// 链接"));
    }
    if trimmed.starts_with('#') {
        return link_status(target, "anchor", None, None);
    }
    if trimmed.starts_with('/') || trimmed.starts_with('\\') || is_windows_absolute(trimmed) {
        return link_status(target, "unsupported", None, Some("不支持绝对路径链接"));
    }

    let without_fragment = trimmed
        .split(|value| value == '#' || value == '?')
        .next()
        .unwrap_or("");
    if without_fragment.is_empty() {
        return link_status(target, "anchor", None, None);
    }

    let decoded = percent_decode(without_fragment);
    let Some(candidate) = normalize_join(document_dir, &decoded) else {
        return link_status(target, "outside", None, Some("链接指向工作区之外"));
    };
    if !candidate.starts_with(root) {
        return link_status(target, "outside", None, Some("链接指向工作区之外"));
    }

    match fs::metadata(&candidate) {
        Ok(metadata) if metadata.is_file() || metadata.is_dir() => {
            let resolved = relative_display_path(root, &candidate).ok();
            link_status(target, "ok", resolved, None)
        }
        Ok(_) => link_status(target, "missing", None, Some("目标不是文件或目录")),
        Err(_) => link_status(target, "missing", None, Some("工作区内找不到该目标")),
    }
}

fn link_status(
    target: &str,
    status: &str,
    resolved_relative_path: Option<String>,
    message: Option<&str>,
) -> MarkdownLinkStatus {
    MarkdownLinkStatus {
        target: target.to_string(),
        status: status.to_string(),
        resolved_relative_path,
        message: message.map(|value| value.to_string()),
    }
}

fn is_windows_absolute(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'/' || bytes[2] == b'\\')
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[index + 1]), hex_value(bytes[index + 2])) {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).to_string()
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

/// 归一化相对路径拼接；出现越界 `..` 或绝对路径时返回 None。
fn normalize_join(base: &Path, relative: &str) -> Option<PathBuf> {
    let mut path = base.to_path_buf();

    for component in Path::new(relative).components() {
        match component {
            Component::Normal(value) => path.push(value),
            Component::CurDir => {}
            Component::ParentDir => {
                if !path.pop() || path.as_os_str().is_empty() {
                    return None;
                }
            }
            Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    Some(path)
}

fn collect_task_items(content: &str, limit: usize) -> (Vec<WorkspaceTaskItem>, bool) {
    let mut tasks = Vec::new();
    let mut fence: Option<(char, usize)> = None;

    for (index, raw_line) in content.split('\n').enumerate() {
        let line = raw_line.trim_end_matches('\r');

        if let Some((marker, length)) = fence {
            if is_fence_close(line, marker, length) {
                fence = None;
            }
            continue;
        }
        if let Some((marker, length)) = parse_fence(line) {
            fence = Some((marker, length));
            continue;
        }

        if let Some(task) = parse_task_line(line, index + 1) {
            tasks.push(task);
            if tasks.len() >= limit {
                return (tasks, true);
            }
        }
    }

    (tasks, false)
}

fn parse_fence(line: &str) -> Option<(char, usize)> {
    let trimmed = line.trim_start();
    let mut chars = trimmed.chars();
    let marker = chars.next()?;
    if marker != '`' && marker != '~' {
        return None;
    }

    let mut length = 1;
    for value in chars {
        if value == marker {
            length += 1;
        } else {
            break;
        }
    }

    if length < 3 {
        return None;
    }
    Some((marker, length))
}

fn is_fence_close(line: &str, marker: char, length: usize) -> bool {
    let trimmed = line.trim();
    let count = trimmed.chars().count();
    count >= length && trimmed.chars().all(|value| value == marker)
}

fn parse_task_line(line: &str, line_number: usize) -> Option<WorkspaceTaskItem> {
    let trimmed = line.trim_start();
    let rest = strip_bullet(trimmed).or_else(|| strip_ordered(trimmed))?;
    let rest = rest.trim_start();

    let bytes = rest.as_bytes();
    if bytes.len() < 3 || bytes[0] != b'[' || bytes[2] != b']' {
        return None;
    }
    let completed = match bytes[1] {
        b' ' => false,
        b'x' | b'X' => true,
        _ => return None,
    };

    let label = rest[3..].trim();
    if label.is_empty() {
        return None;
    }

    Some(WorkspaceTaskItem {
        line: line_number,
        label: label.to_string(),
        completed,
    })
}

fn strip_bullet(line: &str) -> Option<&str> {
    let mut chars = line.chars();
    let marker = chars.next()?;
    if marker != '-' && marker != '+' && marker != '*' {
        return None;
    }
    let rest = chars.as_str();
    if !rest.starts_with(' ') && !rest.starts_with('\t') {
        return None;
    }
    Some(rest)
}

fn strip_ordered(line: &str) -> Option<&str> {
    let digits_end = line
        .find(|value: char| !value.is_ascii_digit())
        .unwrap_or(line.len());
    if digits_end == 0 {
        return None;
    }

    let rest = &line[digits_end..];
    let mut chars = rest.chars();
    let delimiter = chars.next()?;
    if delimiter != '.' && delimiter != ')' {
        return None;
    }
    let rest = chars.as_str();
    if !rest.starts_with(' ') && !rest.starts_with('\t') {
        return None;
    }
    Some(rest)
}
