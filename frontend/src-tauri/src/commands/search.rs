/**
 * @description 基于 WorkspaceId 的受限内容搜索命令：支持 searchId 取消、部分结果返回与超时清理
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 00:20
 */
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use regex::{Regex, RegexBuilder};
use tauri::State;

use crate::commands::{workspace_root_for_registry, WorkspaceRegistry};
use crate::models::{
    CommandError, SearchCancelResponse, SearchMatch, SearchOptions, SearchResponse,
};
use crate::services::{SearchCancellation, SearchSessionRegistry, SEARCH_SESSION_TIMEOUT_SECONDS};

pub(crate) const IGNORED_DIRECTORIES: &[&str] = &[".git", "node_modules", "target", "dist"];
pub(crate) const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn search_workspace(
    registry: State<'_, WorkspaceRegistry>,
    sessions: State<'_, SearchSessionRegistry>,
    workspace_id: String,
    search_id: String,
    query: String,
    options: SearchOptions,
) -> Result<SearchResponse, CommandError> {
    search_workspace_with_session(
        registry.inner(),
        sessions.inner(),
        &workspace_id,
        &search_id,
        &query,
        options,
    )
}

#[tauri::command]
pub fn cancel_search(
    sessions: State<'_, SearchSessionRegistry>,
    search_id: String,
) -> Result<SearchCancelResponse, CommandError> {
    cancel_search_for_registry(sessions.inner(), &search_id)
}

/// 取消进行中的搜索；searchId 已结束或已失效时返回 SEARCH_EXPIRED。
pub fn cancel_search_for_registry(
    sessions: &SearchSessionRegistry,
    search_id: &str,
) -> Result<SearchCancelResponse, CommandError> {
    purge_expired_searches(sessions);
    sessions.cancel(search_id)?;
    Ok(SearchCancelResponse { cancelled: true })
}

/// 带 searchId 的搜索入口：登记会话、执行、结束后回收会话。
pub fn search_workspace_with_session(
    registry: &WorkspaceRegistry,
    sessions: &SearchSessionRegistry,
    workspace_id: &str,
    search_id: &str,
    query: &str,
    options: SearchOptions,
) -> Result<SearchResponse, CommandError> {
    purge_expired_searches(sessions);
    let cancellation = sessions.begin(search_id)?;
    let result =
        search_workspace_cancellable(registry, workspace_id, query, options, &cancellation);
    sessions.finish(search_id);
    result
}

/// 不注册会话的搜索入口，用于内部调用与测试。
pub fn search_workspace_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    query: &str,
    options: SearchOptions,
) -> Result<SearchResponse, CommandError> {
    search_workspace_cancellable(
        registry,
        workspace_id,
        query,
        options,
        &SearchCancellation::default(),
    )
}

/// 可取消的工作区搜索主流程：命中上限、文件大小上限与忽略目录规则保持与旧版一致。
pub fn search_workspace_cancellable(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    query: &str,
    options: SearchOptions,
    cancellation: &SearchCancellation,
) -> Result<SearchResponse, CommandError> {
    if query.is_empty() {
        return Err(CommandError::new("INVALID_PATTERN", "搜索内容不能为空"));
    }

    let root = workspace_root_for_registry(registry, workspace_id)?;
    let expression = build_search_expression(query, &options)?;
    let limit = options.max_results.max(1);

    let (files, mut cancelled) = collect_searchable_files(&root, cancellation)?;
    let mut matches = Vec::new();
    let mut scanned_files = 0;

    for (relative_path, path) in files {
        if cancelled || matches.len() >= limit {
            break;
        }
        if cancellation.is_cancelled() {
            cancelled = true;
            break;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        scanned_files += 1;

        'lines: for (line_index, line) in content.lines().enumerate() {
            for (start, end) in collect_line_matches(&expression, line) {
                matches.push(SearchMatch {
                    path: relative_path.clone(),
                    line: line_index + 1,
                    column: start + 1,
                    length: end - start,
                    preview: line.to_string(),
                });
                if matches.len() >= limit {
                    break 'lines;
                }
            }
        }
    }

    let truncated = matches.len() >= limit;
    matches.truncate(limit);

    Ok(SearchResponse {
        matches,
        truncated,
        scanned_files,
        cancelled,
    })
}

/// 构造搜索表达式；替换预览与替换执行复用同一表达式以保证命中一致。
pub(crate) fn build_search_expression(
    query: &str,
    options: &SearchOptions,
) -> Result<Regex, CommandError> {
    let source = if options.is_regex {
        query.to_string()
    } else {
        regex::escape(query)
    };
    let source = if options.whole_word {
        format!(r"\b(?:{source})\b")
    } else {
        source
    };
    RegexBuilder::new(&source)
        .case_insensitive(!options.case_sensitive)
        .build()
        .map_err(|error| CommandError::new("INVALID_PATTERN", format!("无效的搜索表达式：{error}")))
}

/// 单行命中收集：跳过零长度匹配，保证命中范围互不重叠、可直接用于替换计划。
pub(crate) fn collect_line_matches(expression: &Regex, line: &str) -> Vec<(usize, usize)> {
    expression
        .find_iter(line)
        .filter(|found| found.end() > found.start())
        .map(|found| (found.start(), found.end()))
        .collect()
}

/// 遍历工作区收集可搜索文件；返回相对路径、绝对路径以及是否被取消。
pub(crate) fn collect_searchable_files(
    root: &Path,
    cancellation: &SearchCancellation,
) -> Result<(Vec<(String, PathBuf)>, bool), CommandError> {
    let mut files = Vec::new();
    let cancelled = visit_directory(root, root, cancellation, &mut files)?;
    Ok((files, cancelled))
}

fn visit_directory(
    root: &Path,
    directory: &Path,
    cancellation: &SearchCancellation,
    files: &mut Vec<(String, PathBuf)>,
) -> Result<bool, CommandError> {
    if cancellation.is_cancelled() {
        return Ok(true);
    }

    let entries = fs::read_dir(directory)
        .map_err(|error| CommandError::io(format!("无法遍历工作区：{error}")))?;

    for entry in entries {
        if cancellation.is_cancelled() {
            return Ok(true);
        }

        let entry = entry.map_err(|error| CommandError::io(format!("无法读取目录项：{error}")))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| CommandError::io(format!("无法读取文件类型：{error}")))?;

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            if IGNORED_DIRECTORIES
                .iter()
                .any(|name| path.file_name().is_some_and(|value| value == *name))
            {
                continue;
            }
            if visit_directory(root, &path, cancellation, files)? {
                return Ok(true);
            }
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|error| CommandError::io(format!("无法读取文件元数据：{error}")))?;
        if metadata.len() > MAX_SEARCH_FILE_BYTES {
            continue;
        }

        files.push((relative_display_path(root, &path)?, path));
    }

    Ok(false)
}

pub(crate) fn relative_display_path(root: &Path, path: &Path) -> Result<String, CommandError> {
    path.strip_prefix(root)
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .map_err(|_| CommandError::new("PATH_OUTSIDE_WORKSPACE", "搜索结果路径超出工作区"))
}

fn purge_expired_searches(sessions: &SearchSessionRegistry) {
    sessions.purge_expired(
        Instant::now(),
        Duration::from_secs(SEARCH_SESSION_TIMEOUT_SECONDS),
    );
}
