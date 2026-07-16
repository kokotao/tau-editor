/**
 * @description 基于 WorkspaceId 的受限内容搜索命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:01
 */
use std::fs;
use std::path::Path;

use regex::{Regex, RegexBuilder};
use tauri::State;

use crate::commands::{workspace_root_for_registry, WorkspaceRegistry};
use crate::models::{CommandError, SearchMatch, SearchOptions, SearchResponse};

const IGNORED_DIRECTORIES: &[&str] = &[".git", "node_modules", "target", "dist"];
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn search_workspace(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    query: String,
    options: SearchOptions,
) -> Result<SearchResponse, CommandError> {
    search_workspace_for_registry(registry.inner(), &workspace_id, &query, options)
}

pub fn search_workspace_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    query: &str,
    options: SearchOptions,
) -> Result<SearchResponse, CommandError> {
    if query.is_empty() {
        return Err(CommandError::new("INVALID_PATTERN", "搜索内容不能为空"));
    }
    let root = workspace_root_for_registry(registry, workspace_id)?;
    let expression = build_expression(query, &options)?;
    let mut matches = Vec::new();
    let mut scanned_files = 0;
    visit_directory(&root, &root, &expression, &options, &mut matches, &mut scanned_files)?;
    let truncated = matches.len() >= options.max_results.max(1);
    matches.truncate(options.max_results.max(1));
    Ok(SearchResponse { matches, truncated, scanned_files })
}

fn build_expression(query: &str, options: &SearchOptions) -> Result<Regex, CommandError> {
    let source = if options.is_regex { query.to_string() } else { regex::escape(query) };
    let source = if options.whole_word { format!(r"\b(?:{source})\b") } else { source };
    RegexBuilder::new(&source)
        .case_insensitive(!options.case_sensitive)
        .build()
        .map_err(|error| CommandError::new("INVALID_PATTERN", format!("无效的搜索表达式：{error}")))
}

fn visit_directory(
    root: &Path,
    directory: &Path,
    expression: &Regex,
    options: &SearchOptions,
    matches: &mut Vec<SearchMatch>,
    scanned_files: &mut usize,
) -> Result<(), CommandError> {
    let entries = fs::read_dir(directory)
        .map_err(|error| CommandError::io(format!("无法遍历工作区：{error}")))?;
    for entry in entries {
        if matches.len() >= options.max_results.max(1) {
            return Ok(());
        }
        let entry = entry.map_err(|error| CommandError::io(format!("无法读取目录项：{error}")))?;
        let path = entry.path();
        let file_type = entry.file_type().map_err(|error| CommandError::io(format!("无法读取文件类型：{error}")))?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            if IGNORED_DIRECTORIES.iter().any(|name| path.file_name().is_some_and(|value| value == *name)) {
                continue;
            }
            visit_directory(root, &path, expression, options, matches, scanned_files)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let metadata = entry.metadata().map_err(|error| CommandError::io(format!("无法读取文件元数据：{error}")))?;
        if metadata.len() > MAX_FILE_BYTES {
            continue;
        }
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };
        *scanned_files += 1;
        let relative_path = relative_display_path(root, &path)?;
        for (line_index, line) in content.lines().enumerate() {
            for found in expression.find_iter(line) {
                matches.push(SearchMatch {
                    path: relative_path.clone(),
                    line: line_index + 1,
                    column: found.start() + 1,
                    length: found.end() - found.start(),
                    preview: line.to_string(),
                });
                if matches.len() >= options.max_results.max(1) {
                    return Ok(());
                }
            }
        }
    }
    Ok(())
}

fn relative_display_path(root: &Path, path: &Path) -> Result<String, CommandError> {
    path.strip_prefix(root)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .map_err(|_| CommandError::new("PATH_OUTSIDE_WORKSPACE", "搜索结果路径超出工作区"))
}
