/**
 * @description 本地恢复库 v2 的 Tauri 命令入口
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:10
 */
use tauri::{AppHandle, Manager};

use crate::models::{
    CommandError, RecoveryDeleteResponse, RecoveryDraftRecord, RecoveryRecordsResponse,
    RecoverySessionDocument, RecoveryWriteResponse,
};
use crate::services::RecoveryStore;

#[tauri::command]
pub fn list_recovery_records(app: AppHandle) -> Result<RecoveryRecordsResponse, CommandError> {
    recovery_store(&app)?.list()
}

#[tauri::command]
pub fn write_recovery_record(
    app: AppHandle,
    session: Option<RecoverySessionDocument>,
    drafts: Option<Vec<RecoveryDraftRecord>>,
) -> Result<RecoveryWriteResponse, CommandError> {
    if session.is_none() && drafts.is_none() {
        return Err(CommandError::new(
            "INVALID_RECOVERY_REQUEST",
            "恢复记录写入请求不能为空",
        ));
    }

    let store = recovery_store(&app)?;
    let written_drafts = drafts.as_ref().map_or(0, Vec::len);
    if let Some(session) = session {
        store.write_session(&session)?;
    }

    let deleted_drafts = if let Some(drafts) = drafts {
        store.replace_drafts(&drafts)?.deleted_drafts
    } else {
        0
    };

    Ok(RecoveryWriteResponse {
        written_drafts,
        deleted_drafts,
    })
}

#[tauri::command]
pub fn delete_recovery_record(
    app: AppHandle,
    id: Option<String>,
    path: Option<String>,
    all: Option<bool>,
    session: Option<bool>,
) -> Result<RecoveryDeleteResponse, CommandError> {
    recovery_store(&app)?.delete(
        id.as_deref(),
        path.as_deref(),
        all.unwrap_or(false),
        session.unwrap_or(false),
    )
}

fn recovery_store(app: &AppHandle) -> Result<RecoveryStore, CommandError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::new("RECOVERY_PATH_UNAVAILABLE", error.to_string()))?;
    Ok(RecoveryStore::new(app_data_dir))
}
