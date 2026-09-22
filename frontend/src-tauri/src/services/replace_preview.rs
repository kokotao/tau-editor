/**
 * @description 工作区替换预览会话：登记不可重叠命中计划、按选中项执行、revision 复核写入并支持撤销
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 00:35
 */
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use regex::Regex;

use crate::commands::{
    build_search_expression, collect_line_matches, collect_searchable_files,
    get_file_revision_for_registry, workspace_file_path_for_registry,
    workspace_root_for_registry, write_file_if_revision_for_registry, WorkspaceRegistry,
};
use crate::models::{
    CommandError, ReplaceApplyResponse, ReplaceFileResult, ReplacePreviewFile, ReplacePreviewMatch,
    ReplacePreviewResponse, ReplaceUndoResponse, SearchOptions,
};
use crate::services::SearchCancellation;

/// 替换预览会话的最长存活时间，超时后必须重新预览。
pub const REPLACE_PREVIEW_TIMEOUT_SECONDS: u64 = 300;
/// 单次预览最多覆盖的文件数。
const MAX_PREVIEW_FILES: usize = 200;
/// 单次预览最多生成的命中项。
const MAX_PREVIEW_MATCHES: usize = 2000;
/// 单文件超过该大小不保留撤销副本。
const MAX_UNDO_FILE_BYTES: usize = 1024 * 1024;
/// 单次撤销最多保留的原始内容总量。
const MAX_UNDO_TOTAL_BYTES: usize = 8 * 1024 * 1024;

static NEXT_PREVIEW_ID: AtomicU64 = AtomicU64::new(1);
static NEXT_UNDO_ID: AtomicU64 = AtomicU64::new(1);

/// 预览阶段冻结的命中计划：仅保存命中序号与 revision，执行时重新计算偏移。
struct PreviewFilePlan {
    relative_path: String,
    revision: String,
    match_count: usize,
    expression: Regex,
    replacement: String,
}

struct PreviewSession {
    workspace_id: String,
    created_at: Instant,
    files: Vec<PreviewFilePlan>,
}

/// 撤销副本：record 时写入磁盘后的 revision，用于撤销时的冲突校验。
struct UndoFileEntry {
    relative_path: String,
    content: String,
    revision: String,
}

struct UndoRecord {
    workspace_id: String,
    created_at: Instant,
    files: Vec<UndoFileEntry>,
}

/// 由 Tauri 托管的替换预览与撤销注册表。
#[derive(Default)]
pub struct ReplacePreviewRegistry {
    previews: Mutex<HashMap<String, PreviewSession>>,
    undos: Mutex<HashMap<String, UndoRecord>>,
}

impl ReplacePreviewRegistry {
    fn lock_previews(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, PreviewSession>>, CommandError> {
        self.previews
            .lock()
            .map_err(|_| CommandError::io("替换预览注册表不可用"))
    }

    fn lock_undos(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, UndoRecord>>, CommandError> {
        self.undos
            .lock()
            .map_err(|_| CommandError::io("替换撤销注册表不可用"))
    }

    /// 取出并移除预览计划；previewId 失效或不属于当前工作区时返回 PREVIEW_EXPIRED。
    fn take_preview(
        &self,
        preview_id: &str,
        workspace_id: &str,
    ) -> Result<PreviewSession, CommandError> {
        let mut previews = self.lock_previews()?;
        match previews.remove(preview_id) {
            Some(session) if session.workspace_id == workspace_id => Ok(session),
            Some(session) => {
                previews.insert(preview_id.to_string(), session);
                Err(CommandError::new(
                    "PREVIEW_EXPIRED",
                    "替换预览已失效，请重新生成预览",
                ))
            }
            None => Err(CommandError::new(
                "PREVIEW_EXPIRED",
                "替换预览已失效，请重新生成预览",
            )),
        }
    }

    /// 取出并移除撤销副本；undo_id 失效时返回 UNDO_EXPIRED。
    fn take_undo(&self, undo_id: &str, workspace_id: &str) -> Result<UndoRecord, CommandError> {
        let mut undos = self.lock_undos()?;
        match undos.remove(undo_id) {
            Some(record) if record.workspace_id == workspace_id => Ok(record),
            Some(record) => {
                undos.insert(undo_id.to_string(), record);
                Err(CommandError::new("UNDO_EXPIRED", "撤销记录已失效"))
            }
            None => Err(CommandError::new("UNDO_EXPIRED", "撤销记录已失效")),
        }
    }

    fn store_preview(&self, session: PreviewSession) -> Result<String, CommandError> {
        let preview_id = format!(
            "preview-{}-{}",
            std::process::id(),
            NEXT_PREVIEW_ID.fetch_add(1, Ordering::Relaxed)
        );
        self.lock_previews()?.insert(preview_id.clone(), session);
        Ok(preview_id)
    }

    fn store_undo(&self, record: UndoRecord) -> Result<String, CommandError> {
        let undo_id = format!(
            "undo-{}-{}",
            std::process::id(),
            NEXT_UNDO_ID.fetch_add(1, Ordering::Relaxed)
        );
        self.lock_undos()?.insert(undo_id.clone(), record);
        Ok(undo_id)
    }

    /// 清理超时的预览与撤销记录。
    pub fn purge_expired(&self, now: Instant, timeout: Duration) -> usize {
        let mut removed = 0;

        if let Ok(mut previews) = self.previews.lock() {
            let expired: Vec<String> = previews
                .iter()
                .filter(|(_, session)| now.duration_since(session.created_at) >= timeout)
                .map(|(id, _)| id.clone())
                .collect();
            for id in &expired {
                previews.remove(id);
            }
            removed += expired.len();
        }

        if let Ok(mut undos) = self.undos.lock() {
            let expired: Vec<String> = undos
                .iter()
                .filter(|(_, record)| now.duration_since(record.created_at) >= timeout)
                .map(|(id, _)| id.clone())
                .collect();
            for id in &expired {
                undos.remove(id);
            }
            removed += expired.len();
        }

        removed
    }
}

/// 生成替换预览：命中范围按行收集、互不重叠，并冻结每个文件当前的 revision。
pub fn create_replace_preview(
    previews: &ReplacePreviewRegistry,
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    query: &str,
    replacement: &str,
    options: &SearchOptions,
) -> Result<ReplacePreviewResponse, CommandError> {
    if query.is_empty() {
        return Err(CommandError::new("INVALID_PATTERN", "搜索内容不能为空"));
    }

    purge_expired_previews(previews);

    let root = workspace_root_for_registry(registry, workspace_id)?;
    let expression = build_search_expression(query, options)?;
    let (candidates, _) = collect_searchable_files(&root, &SearchCancellation::default())?;

    let mut files = Vec::new();
    let mut plans = Vec::new();
    let mut total_matches = 0usize;
    let mut scanned_files = 0usize;
    let mut truncated = false;

    for (relative_path, path) in candidates {
        if files.len() >= MAX_PREVIEW_FILES || total_matches >= MAX_PREVIEW_MATCHES {
            truncated = true;
            break;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        scanned_files += 1;

        let mut matches = Vec::new();
        let mut file_truncated = false;

        'lines: for (line_index, line) in content.lines().enumerate() {
            for (start, end) in collect_line_matches(&expression, line) {
                if total_matches + matches.len() >= MAX_PREVIEW_MATCHES {
                    file_truncated = true;
                    truncated = true;
                    break 'lines;
                }

                let after = replace_line_match(&expression, line, start, end, replacement);
                matches.push(ReplacePreviewMatch {
                    match_id: format!("{relative_path}#{}", matches.len()),
                    line: line_index + 1,
                    column: start + 1,
                    length: end - start,
                    before: line.to_string(),
                    after,
                });
            }
        }

        if matches.is_empty() {
            continue;
        }

        let revision = get_file_revision_for_registry(registry, workspace_id, &relative_path, false)?
            .revision
            .ok_or_else(|| {
                CommandError::new("FILE_NOT_FOUND", format!("替换目标已不存在：{relative_path}"))
            })?;

        total_matches += matches.len();
        plans.push(PreviewFilePlan {
            relative_path: relative_path.clone(),
            revision: revision.clone(),
            match_count: matches.len(),
            expression: expression.clone(),
            replacement: replacement.to_string(),
        });
        files.push(ReplacePreviewFile {
            relative_path,
            revision,
            matches,
            truncated: file_truncated,
        });
    }

    let session = PreviewSession {
        workspace_id: workspace_id.to_string(),
        created_at: Instant::now(),
        files: plans,
    };
    let preview_id = previews.store_preview(session)?;

    Ok(ReplacePreviewResponse {
        preview_id,
        files,
        total_matches,
        scanned_files,
        truncated,
    })
}

/// 按 previewId 与选中 matchId 执行替换：逐文件复核 revision，成功、跳过、冲突、失败逐项返回。
pub fn apply_replace_preview(
    previews: &ReplacePreviewRegistry,
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    preview_id: &str,
    match_ids: &[String],
) -> Result<ReplaceApplyResponse, CommandError> {
    purge_expired_previews(previews);

    let session = previews.take_preview(preview_id, workspace_id)?;
    let selection = group_selection(&session, match_ids)?;

    let mut results = Vec::new();
    let mut undo_files = Vec::new();
    let mut undo_bytes = 0usize;
    let mut applied_total = 0usize;
    let mut skipped_total = 0usize;
    let mut conflicts_total = 0usize;
    let mut failed_total = 0usize;

    for plan in &session.files {
        let Some(selected) = selection.get(&plan.relative_path) else {
            continue;
        };

        let applied_ids: Vec<String> = selected
            .iter()
            .map(|index| format!("{}#{}", plan.relative_path, index))
            .collect();

        let path = match workspace_file_path_for_registry(registry, workspace_id, &plan.relative_path)
        {
            Ok(path) => path,
            Err(error) => {
                failed_total += 1;
                results.push(failed_result(&plan.relative_path, error.message));
                continue;
            }
        };

        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) => {
                failed_total += 1;
                results.push(failed_result(
                    &plan.relative_path,
                    format!("无法读取替换文件：{error}"),
                ));
                continue;
            }
        };

        let current_revision = match get_file_revision_for_registry(
            registry,
            workspace_id,
            &plan.relative_path,
            false,
        ) {
            Ok(revision) => revision.revision,
            Err(error) => {
                failed_total += 1;
                results.push(failed_result(&plan.relative_path, error.message));
                continue;
            }
        };

        if current_revision.as_deref() != Some(plan.revision.as_str()) {
            conflicts_total += 1;
            results.push(ReplaceFileResult {
                relative_path: plan.relative_path.clone(),
                status: "conflict".to_string(),
                applied_match_ids: Vec::new(),
                undoable: false,
                message: Some("文件在预览后被修改，已跳过该文件".to_string()),
            });
            continue;
        }

        let (replaced, applied_count) = apply_selected_matches(
            &content,
            &plan.expression,
            &plan.replacement,
            selected,
        );

        if applied_count == 0 {
            skipped_total += 1;
            results.push(ReplaceFileResult {
                relative_path: plan.relative_path.clone(),
                status: "skipped".to_string(),
                applied_match_ids: Vec::new(),
                undoable: false,
                message: Some("选中的命中项已被移除，未写入文件".to_string()),
            });
            continue;
        }

        match write_file_if_revision_for_registry(
            registry,
            workspace_id,
            &plan.relative_path,
            &replaced,
            &plan.revision,
        ) {
            Ok(response) => {
                applied_total += 1;

                let mut undoable = false;
                if content.len() <= MAX_UNDO_FILE_BYTES
                    && undo_bytes + content.len() <= MAX_UNDO_TOTAL_BYTES
                {
                    undo_bytes += content.len();
                    undo_files.push(UndoFileEntry {
                        relative_path: plan.relative_path.clone(),
                        content,
                        revision: response.revision,
                    });
                    undoable = true;
                }

                results.push(ReplaceFileResult {
                    relative_path: plan.relative_path.clone(),
                    status: "applied".to_string(),
                    applied_match_ids: applied_ids,
                    undoable,
                    message: None,
                });
            }
            Err(error) if error.code == "FILE_CONFLICT" => {
                conflicts_total += 1;
                results.push(ReplaceFileResult {
                    relative_path: plan.relative_path.clone(),
                    status: "conflict".to_string(),
                    applied_match_ids: Vec::new(),
                    undoable: false,
                    message: Some(error.message),
                });
            }
            Err(error) => {
                failed_total += 1;
                results.push(failed_result(&plan.relative_path, error.message));
            }
        }
    }

    let undo_id = if undo_files.is_empty() {
        None
    } else {
        Some(previews.store_undo(UndoRecord {
            workspace_id: workspace_id.to_string(),
            created_at: Instant::now(),
            files: undo_files,
        })?)
    };

    Ok(ReplaceApplyResponse {
        preview_id: preview_id.to_string(),
        undo_id,
        results,
        applied: applied_total,
        skipped: skipped_total,
        conflicts: conflicts_total,
        failed: failed_total,
    })
}

/// 撤销上一次替换：按撤销副本与写入后的 revision 逐文件回写原始内容。
pub fn undo_replace(
    previews: &ReplacePreviewRegistry,
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    undo_id: &str,
) -> Result<ReplaceUndoResponse, CommandError> {
    purge_expired_previews(previews);

    let record = previews.take_undo(undo_id, workspace_id)?;
    let mut restored = Vec::new();
    let mut conflicts = Vec::new();
    let mut failed = Vec::new();

    for entry in record.files {
        match write_file_if_revision_for_registry(
            registry,
            workspace_id,
            &entry.relative_path,
            &entry.content,
            &entry.revision,
        ) {
            Ok(_) => restored.push(entry.relative_path),
            Err(error) if error.code == "FILE_CONFLICT" => conflicts.push(entry.relative_path),
            Err(error) => failed.push(failed_result(&entry.relative_path, error.message)),
        }
    }

    Ok(ReplaceUndoResponse {
        undo_id: undo_id.to_string(),
        restored,
        conflicts,
        failed,
    })
}

/// 将 matchId 选择结果按文件归组；未知 matchId 直接报错，避免静默漏替换。
fn group_selection(
    session: &PreviewSession,
    match_ids: &[String],
) -> Result<HashMap<String, BTreeSet<usize>>, CommandError> {
    let mut selection: HashMap<String, BTreeSet<usize>> = HashMap::new();

    for match_id in match_ids {
        let (path, index) = match_id.rsplit_once('#').ok_or_else(|| {
            CommandError::new("MATCH_ID_INVALID", format!("替换命中标识非法：{match_id}"))
        })?;
        let index: usize = index.parse().map_err(|_| {
            CommandError::new("MATCH_ID_INVALID", format!("替换命中标识非法：{match_id}"))
        })?;

        let plan = session
            .files
            .iter()
            .find(|plan| plan.relative_path == path)
            .ok_or_else(|| {
                CommandError::new("MATCH_ID_INVALID", format!("替换命中已失效：{match_id}"))
            })?;

        if index >= plan.match_count {
            return Err(CommandError::new(
                "MATCH_ID_INVALID",
                format!("替换命中已失效：{match_id}"),
            ));
        }

        selection.entry(path.to_string()).or_default().insert(index);
    }

    Ok(selection)
}

/// 按选中序号替换：从后往前替换单行内命中，保证偏移不失效。
fn apply_selected_matches(
    content: &str,
    expression: &Regex,
    replacement: &str,
    selected: &BTreeSet<usize>,
) -> (String, usize) {
    let mut output = String::with_capacity(content.len());
    let mut match_index = 0usize;
    let mut applied = 0usize;

    for segment in content.split_inclusive('\n') {
        let (body, ending) = split_line_ending(segment);
        let hits = collect_line_matches(expression, body);

        if hits.is_empty() {
            output.push_str(segment);
            continue;
        }

        let mut new_body = body.to_string();
        for (offset, (start, end)) in hits.iter().enumerate().rev() {
            if selected.contains(&(match_index + offset)) {
                let replaced = expression.replace(&body[*start..*end], replacement);
                new_body.replace_range(*start..*end, &replaced);
                applied += 1;
            }
        }

        match_index += hits.len();
        output.push_str(&new_body);
        output.push_str(ending);
    }

    (output, applied)
}

/// 拆分行尾，保留原始换行符，避免替换后丢失 CRLF 或末行无换行。
fn split_line_ending(segment: &str) -> (&str, &str) {
    match segment.strip_suffix('\n') {
        Some(rest) => match rest.strip_suffix('\r') {
            Some(body) => (body, "\r\n"),
            None => (rest, "\n"),
        },
        None => (segment, ""),
    }
}

fn replace_line_match(
    expression: &Regex,
    line: &str,
    start: usize,
    end: usize,
    replacement: &str,
) -> String {
    let mut after = String::with_capacity(line.len());
    after.push_str(&line[..start]);
    after.push_str(&expression.replace(&line[start..end], replacement));
    after.push_str(&line[end..]);
    after
}

fn failed_result(relative_path: &str, message: String) -> ReplaceFileResult {
    ReplaceFileResult {
        relative_path: relative_path.to_string(),
        status: "failed".to_string(),
        applied_match_ids: Vec::new(),
        undoable: false,
        message: Some(message),
    }
}

fn purge_expired_previews(previews: &ReplacePreviewRegistry) {
    previews.purge_expired(
        Instant::now(),
        Duration::from_secs(REPLACE_PREVIEW_TIMEOUT_SECONDS),
    );
}
