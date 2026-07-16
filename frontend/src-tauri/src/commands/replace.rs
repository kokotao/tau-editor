/**
 * @description 逐文件 revision 校验后的 Workspace 安全替换命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 13:18
 */
use std::fs;

use tauri::State;

use crate::commands::{
    build_search_expression, workspace_file_path_for_registry,
    write_file_if_revision_for_registry, WorkspaceRegistry,
};
use crate::models::{CommandError, ReplaceOperation, ReplaceResponse};

#[tauri::command]
pub fn apply_workspace_replace(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    operations: Vec<ReplaceOperation>,
) -> Result<ReplaceResponse, CommandError> {
    apply_workspace_replace_for_registry(registry.inner(), &workspace_id, &operations)
}

pub fn apply_workspace_replace_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    operations: &[ReplaceOperation],
) -> Result<ReplaceResponse, CommandError> {
    let mut changed = Vec::new();
    let mut conflicts = Vec::new();
    for operation in operations {
        let path = workspace_file_path_for_registry(registry, workspace_id, &operation.relative_path)?;
        let content = fs::read_to_string(&path)
            .map_err(|error| CommandError::io(format!("无法读取替换文件：{error}")))?;
        let expression = build_search_expression(&operation.query, &operation.options)?;
        let replaced = expression.replace_all(&content, operation.replacement.as_str()).into_owned();
        if replaced == content {
            continue;
        }
        match write_file_if_revision_for_registry(
            registry,
            workspace_id,
            &operation.relative_path,
            &replaced,
            &operation.expected_revision,
        ) {
            Ok(_) => changed.push(operation.relative_path.clone()),
            Err(error) if error.code == "FILE_CONFLICT" => conflicts.push(operation.relative_path.clone()),
            Err(error) => return Err(error),
        }
    }
    Ok(ReplaceResponse { changed, conflicts })
}
