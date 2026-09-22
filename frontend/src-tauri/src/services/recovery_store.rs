/**
 * @description 本地恢复库 v2 的原子存储、迁移兼容和限额清理服务
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:10
 */
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::models::{
    CommandError, RecoveryDeleteResponse, RecoveryDraftRecord, RecoveryLimits,
    RecoveryRecordsResponse, RecoverySessionDocument, RecoveryWriteResponse,
    RECOVERY_DOCUMENT_VERSION,
};

pub const RECOVERY_MAX_DRAFTS: usize = 40;
pub const RECOVERY_MAX_TOTAL_BYTES: usize = 32 * 1024 * 1024;
pub const RECOVERY_MAX_AGE_DAYS: u64 = 30;
const RECOVERY_DIR_NAME: &str = "recovery-v2";
const SESSION_FILE_NAME: &str = "session.json";
const DRAFTS_DIR_NAME: &str = "drafts";
static NEXT_TEMP_ID: AtomicU64 = AtomicU64::new(1);

pub struct RecoveryStore {
    root: PathBuf,
}

impl RecoveryStore {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            root: app_data_dir.join(RECOVERY_DIR_NAME),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn list(&self) -> Result<RecoveryRecordsResponse, CommandError> {
        self.ensure_directories()?;
        let session = self.read_session()?;
        let mut drafts = self.read_drafts()?;
        self.prune_drafts(&mut drafts)?;
        drafts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

        Ok(RecoveryRecordsResponse {
            session,
            drafts,
            limits: RecoveryLimits {
                max_drafts: RECOVERY_MAX_DRAFTS,
                max_total_bytes: RECOVERY_MAX_TOTAL_BYTES,
                max_age_days: RECOVERY_MAX_AGE_DAYS,
            },
        })
    }

    pub fn write_session(&self, session: &RecoverySessionDocument) -> Result<(), CommandError> {
        validate_session(session)?;
        self.ensure_directories()?;
        self.atomic_write_json(&self.session_path(), session)
    }

    pub fn replace_drafts(
        &self,
        drafts: &[RecoveryDraftRecord],
    ) -> Result<RecoveryWriteResponse, CommandError> {
        for draft in drafts {
            validate_draft(draft)?;
        }

        self.ensure_directories()?;
        let drafts_dir = self.drafts_dir();
        let mut retained_files = Vec::with_capacity(drafts.len());
        for draft in drafts {
            let file_path = drafts_dir.join(format!("{}.json", draft_file_key(draft)?));
            self.atomic_write_json(&file_path, draft)?;
            retained_files.push(file_path);
        }

        let retained = retained_files
            .iter()
            .filter_map(|path| path.file_name().and_then(|name| name.to_str()))
            .map(str::to_string)
            .collect::<std::collections::HashSet<_>>();

        let mut deleted_drafts = 0;
        for entry in fs::read_dir(&drafts_dir)
            .map_err(|error| CommandError::io(format!("无法读取恢复草稿目录：{error}")))?
        {
            let entry = entry
                .map_err(|error| CommandError::io(format!("无法读取恢复草稿目录项：{error}")))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if retained.contains(file_name) {
                continue;
            }
            if fs::remove_file(&path).is_ok() {
                deleted_drafts += 1;
            }
        }

        let mut persisted = self.read_drafts()?;
        self.prune_drafts(&mut persisted)?;
        Ok(RecoveryWriteResponse {
            written_drafts: drafts.len(),
            deleted_drafts,
        })
    }

    pub fn delete(
        &self,
        id: Option<&str>,
        path: Option<&str>,
        all: bool,
        session: bool,
    ) -> Result<RecoveryDeleteResponse, CommandError> {
        self.ensure_directories()?;
        let session_deleted = if session {
            let path = self.session_path();
            if path.exists() {
                fs::remove_file(&path)
                    .map_err(|error| CommandError::io(format!("无法删除恢复会话：{error}")))?;
                1
            } else {
                0
            }
        } else {
            0
        };
        if all {
            let drafts_dir = self.drafts_dir();
            if drafts_dir.exists() {
                fs::remove_dir_all(&drafts_dir)
                    .map_err(|error| CommandError::io(format!("无法清空恢复草稿：{error}")))?;
            }
            fs::create_dir_all(&drafts_dir)
                .map_err(|error| CommandError::io(format!("无法重建恢复草稿目录：{error}")))?;
            return Ok(RecoveryDeleteResponse {
                deleted: session_deleted,
            });
        }

        let key = path
            .filter(|value| !value.is_empty())
            .or_else(|| id.filter(|value| !value.is_empty()))
            .ok_or_else(|| CommandError::new("INVALID_RECOVERY_REQUEST", "缺少恢复记录标识"))?;
        let file_path = self
            .drafts_dir()
            .join(format!("{}.json", sha256_hex(key.as_bytes())));
        if !file_path.exists() {
            return Ok(RecoveryDeleteResponse {
                deleted: session_deleted,
            });
        }

        fs::remove_file(&file_path)
            .map_err(|error| CommandError::io(format!("无法删除恢复草稿：{error}")))?;
        Ok(RecoveryDeleteResponse {
            deleted: session_deleted + 1,
        })
    }

    fn ensure_directories(&self) -> Result<(), CommandError> {
        fs::create_dir_all(self.drafts_dir())
            .map_err(|error| CommandError::io(format!("无法创建恢复草稿目录：{error}")))
    }

    fn read_session(&self) -> Result<Option<RecoverySessionDocument>, CommandError> {
        let path = self.session_path();
        if !path.exists() {
            return Ok(None);
        }

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) => {
                log::warn!("读取恢复会话失败 {}：{}", path.display(), error);
                return Ok(None);
            }
        };

        match serde_json::from_slice::<RecoverySessionDocument>(&bytes) {
            Ok(session) if session.version == RECOVERY_DOCUMENT_VERSION => Ok(Some(session)),
            Ok(session) => {
                log::warn!(
                    "忽略不支持的恢复会话版本 {}：{}",
                    session.version,
                    path.display()
                );
                Ok(None)
            }
            Err(error) => {
                log::warn!("忽略损坏的恢复会话 {}：{}", path.display(), error);
                Ok(None)
            }
        }
    }

    fn read_drafts(&self) -> Result<Vec<RecoveryDraftRecord>, CommandError> {
        let mut drafts = Vec::new();
        for entry in fs::read_dir(self.drafts_dir())
            .map_err(|error| CommandError::io(format!("无法读取恢复草稿目录：{error}")))?
        {
            let entry = entry
                .map_err(|error| CommandError::io(format!("无法读取恢复草稿目录项：{error}")))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }

            let bytes = match fs::read(&path) {
                Ok(bytes) => bytes,
                Err(error) => {
                    log::warn!("读取恢复草稿失败 {}：{}", path.display(), error);
                    continue;
                }
            };
            match serde_json::from_slice::<RecoveryDraftRecord>(&bytes) {
                Ok(draft) if draft.version == RECOVERY_DOCUMENT_VERSION => drafts.push(draft),
                Ok(draft) => {
                    log::warn!(
                        "忽略不支持的恢复草稿版本 {}：{}",
                        draft.version,
                        path.display()
                    );
                }
                Err(error) => {
                    log::warn!("忽略损坏的恢复草稿 {}：{}", path.display(), error);
                }
            }
        }
        Ok(drafts)
    }

    fn prune_drafts(&self, drafts: &mut Vec<RecoveryDraftRecord>) -> Result<(), CommandError> {
        drafts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        let now = now_ms();
        let max_age_ms = RECOVERY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
        let mut retained = Vec::new();
        let mut total_bytes = 0usize;
        let mut removed_files = Vec::new();

        for draft in drafts.drain(..) {
            let too_old = draft.updated_at.saturating_add(max_age_ms) < now;
            let too_many = retained.len() >= RECOVERY_MAX_DRAFTS;
            let draft_bytes = draft.content.len();
            let too_large = total_bytes.saturating_add(draft_bytes) > RECOVERY_MAX_TOTAL_BYTES;
            if too_old || too_many || too_large {
                removed_files.push(self.draft_file_path(&draft));
                continue;
            }

            total_bytes = total_bytes.saturating_add(draft_bytes);
            retained.push(draft);
        }

        for path in removed_files {
            if let Err(error) = fs::remove_file(&path) {
                if error.kind() != std::io::ErrorKind::NotFound {
                    log::warn!("清理恢复草稿失败 {}：{}", path.display(), error);
                }
            }
        }

        *drafts = retained;
        Ok(())
    }

    fn session_path(&self) -> PathBuf {
        self.root.join(SESSION_FILE_NAME)
    }

    fn drafts_dir(&self) -> PathBuf {
        self.root.join(DRAFTS_DIR_NAME)
    }

    fn draft_file_path(&self, draft: &RecoveryDraftRecord) -> PathBuf {
        let key = draft
            .path
            .as_deref()
            .filter(|value| !value.is_empty())
            .unwrap_or(draft.id.as_str());
        self.drafts_dir()
            .join(format!("{}.json", sha256_hex(key.as_bytes())))
    }

    fn atomic_write_json<T: Serialize>(&self, path: &Path, value: &T) -> Result<(), CommandError> {
        let bytes = serde_json::to_vec_pretty(value)
            .map_err(|error| CommandError::new("RECOVERY_SERIALIZE_FAILED", error.to_string()))?;
        self.atomic_write_bytes(path, &bytes)
    }

    fn atomic_write_bytes(&self, path: &Path, bytes: &[u8]) -> Result<(), CommandError> {
        let parent = path
            .parent()
            .ok_or_else(|| CommandError::io("恢复记录目标路径无效"))?;
        fs::create_dir_all(parent)
            .map_err(|error| CommandError::io(format!("无法创建恢复记录目录：{error}")))?;

        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| CommandError::io("恢复记录文件名无效"))?;
        let temporary_path = parent.join(format!(
            ".{file_name}.{}.{}.tmp",
            std::process::id(),
            NEXT_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));

        let write_result = (|| -> Result<(), CommandError> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary_path)
                .map_err(|error| CommandError::io(format!("无法创建恢复临时文件：{error}")))?;
            file.write_all(bytes)
                .map_err(|error| CommandError::io(format!("无法写入恢复临时文件：{error}")))?;
            file.sync_all()
                .map_err(|error| CommandError::io(format!("无法同步恢复临时文件：{error}")))?;
            replace_file(&temporary_path, path)
                .map_err(|error| CommandError::io(format!("无法替换恢复记录文件：{error}")))?;
            sync_parent_directory(parent);
            Ok(())
        })();

        if write_result.is_err() {
            let _ = fs::remove_file(&temporary_path);
        }
        write_result
    }
}

fn validate_session(session: &RecoverySessionDocument) -> Result<(), CommandError> {
    if session.version != RECOVERY_DOCUMENT_VERSION {
        return Err(CommandError::new(
            "RECOVERY_VERSION_UNSUPPORTED",
            format!("恢复会话版本必须为 {RECOVERY_DOCUMENT_VERSION}"),
        ));
    }
    if session.saved_at == 0 {
        return Err(CommandError::new(
            "INVALID_RECOVERY_SESSION",
            "恢复会话缺少保存时间",
        ));
    }
    Ok(())
}

fn validate_draft(draft: &RecoveryDraftRecord) -> Result<(), CommandError> {
    if draft.version != RECOVERY_DOCUMENT_VERSION {
        return Err(CommandError::new(
            "RECOVERY_VERSION_UNSUPPORTED",
            format!("恢复草稿版本必须为 {RECOVERY_DOCUMENT_VERSION}"),
        ));
    }
    if draft.id.trim().is_empty() {
        return Err(CommandError::new(
            "INVALID_RECOVERY_DRAFT",
            "恢复草稿缺少标识",
        ));
    }
    if draft.content.len() > RECOVERY_MAX_TOTAL_BYTES {
        return Err(CommandError::new(
            "RECOVERY_DRAFT_TOO_LARGE",
            "单个恢复草稿超过 32MiB 限制",
        ));
    }
    Ok(())
}

fn draft_file_key(draft: &RecoveryDraftRecord) -> Result<String, CommandError> {
    let key = draft
        .path
        .as_deref()
        .filter(|value| !value.is_empty())
        .unwrap_or(draft.id.as_str());
    if key.trim().is_empty() {
        return Err(CommandError::new(
            "INVALID_RECOVERY_DRAFT",
            "恢复草稿路径和标识均为空",
        ));
    }
    Ok(sha256_hex(key.as_bytes()))
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().try_into().unwrap_or(u64::MAX))
        .unwrap_or_default()
}

fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    if destination.exists() {
        fs::remove_file(destination)?;
    }

    fs::rename(source, destination)
}

fn sync_parent_directory(parent: &Path) {
    #[cfg(unix)]
    if let Ok(directory) = fs::File::open(parent) {
        if let Err(error) = directory.sync_all() {
            log::warn!(
                "恢复记录已提交，但无法同步目录 {}：{}",
                parent.display(),
                error
            );
        }
    }

    #[cfg(not(unix))]
    let _ = parent;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{RecoveryBaseFingerprint, RecoveryCursor};
    use tempfile::tempdir;

    fn draft(id: &str, updated_at: u64, content: &str) -> RecoveryDraftRecord {
        RecoveryDraftRecord {
            version: RECOVERY_DOCUMENT_VERSION,
            id: id.to_string(),
            path: Some(format!("/workspace/{id}.md")),
            base_fingerprint: Some(RecoveryBaseFingerprint {
                mtime_ms: Some(updated_at),
                size: Some(content.len() as u64),
            }),
            content: content.to_string(),
            updated_at,
            cursor: Some(RecoveryCursor { line: 1, column: 1 }),
            scroll_top: Some(0.0),
            tab: None,
        }
    }

    #[test]
    fn writes_session_and_keeps_only_forty_newest_drafts() {
        let directory = tempdir().expect("temp dir");
        let store = RecoveryStore::new(directory.path().to_path_buf());
        let session = RecoverySessionDocument {
            version: RECOVERY_DOCUMENT_VERSION,
            saved_at: 1,
            workspace_path: Some("/workspace".to_string()),
            active_tab_path: Some("/workspace/a.md".to_string()),
            open_tabs: Vec::new(),
            layout: serde_json::json!({ "mode": "workspace" }),
            recent_workspaces: vec!["/workspace".to_string()],
            tabs: Vec::new(),
        };
        store.write_session(&session).expect("write session");

        let drafts = (0..45)
            .map(|index| {
                let updated_at = now_ms() - (45 - index as u64) * 1_000;
                draft(&format!("draft-{index}"), updated_at, "content")
            })
            .collect::<Vec<_>>();
        store.replace_drafts(&drafts).expect("write drafts");

        let records = store.list().expect("list records");
        assert_eq!(records.session, Some(session));
        assert_eq!(records.drafts.len(), RECOVERY_MAX_DRAFTS);
        assert_eq!(
            records.drafts.first().map(|item| item.id.as_str()),
            Some("draft-44")
        );
        assert!(!records.drafts.iter().any(|item| item.id == "draft-0"));
    }

    #[test]
    fn removes_expired_drafts_and_stale_files() {
        let directory = tempdir().expect("temp dir");
        let store = RecoveryStore::new(directory.path().to_path_buf());
        let now = now_ms();
        let expired = draft(
            "expired",
            now - RECOVERY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000 - 1,
            "old",
        );
        let current = draft("current", now, "new");
        store
            .replace_drafts(&[expired, current.clone()])
            .expect("write drafts");

        let records = store.list().expect("list records");
        assert_eq!(records.drafts, vec![current]);

        store.replace_drafts(&[]).expect("clear drafts");
        assert!(store.list().expect("list records").drafts.is_empty());
    }

    #[test]
    fn deletes_a_single_draft_by_path() {
        let directory = tempdir().expect("temp dir");
        let store = RecoveryStore::new(directory.path().to_path_buf());
        let record = draft("single", now_ms(), "draft");
        store
            .replace_drafts(&[record.clone()])
            .expect("write draft");

        let response = store
            .delete(None, Some("/workspace/single.md"), false, false)
            .expect("delete draft");
        assert_eq!(response.deleted, 1);
        assert!(store.list().expect("list records").drafts.is_empty());
    }
}
