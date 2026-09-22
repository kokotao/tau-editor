/**
 * @description 多窗口标签迁移：payload 与窗口 label 绑定，取出即删，10 分钟过期
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 18:12
 */
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::models::CommandError;

/// 单窗口迁移上限：8 个标签、总内容 8 MB。
pub const WINDOW_TRANSFER_MAX_TABS: usize = 8;
pub const WINDOW_TRANSFER_MAX_BYTES: usize = 8 * 1024 * 1024;
/// payload 在 Rust 侧的存活时间，超时后由下一次访问清理。
pub const WINDOW_TRANSFER_TTL: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowTransferCursor {
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowTransferTab {
    pub file_path: Option<String>,
    pub file_name: String,
    pub content: String,
    pub is_dirty: bool,
    pub is_untitled: bool,
    pub language: Option<String>,
    pub cursor: Option<WindowTransferCursor>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowTransferPayload {
    pub tabs: Vec<WindowTransferTab>,
    pub active_index: usize,
    pub source_workspace_path: Option<String>,
}

struct PendingTransfer {
    payload: WindowTransferPayload,
    created_at: Instant,
}

/// 按窗口 label 暂存迁移 payload；取出即删，避免串窗口与泄漏。
#[derive(Default)]
pub struct WindowTransferRegistry {
    pending: Mutex<HashMap<String, PendingTransfer>>,
}

impl WindowTransferRegistry {
    fn with_pending<T>(&self, action: impl FnOnce(&mut HashMap<String, PendingTransfer>) -> T) -> Result<T, CommandError> {
        let mut guard = self
            .pending
            .lock()
            .map_err(|_| CommandError::new("WINDOW_TRANSFER_LOCK_FAILED", "窗口迁移状态不可用"))?;
        Ok(action(&mut guard))
    }

    fn prune_expired(&self, pending: &mut HashMap<String, PendingTransfer>) {
        let now = Instant::now();
        pending.retain(|_, entry| now.duration_since(entry.created_at) < WINDOW_TRANSFER_TTL);
    }

    fn insert(&self, label: &str, payload: WindowTransferPayload) -> Result<(), CommandError> {
        self.with_pending(|pending| {
            self.prune_expired(pending);
            pending.insert(
                label.to_string(),
                PendingTransfer {
                    payload,
                    created_at: Instant::now(),
                },
            );
        })
    }

    fn take(&self, label: &str) -> Result<Option<WindowTransferPayload>, CommandError> {
        self.with_pending(|pending| {
            self.prune_expired(pending);
            pending.remove(label).map(|entry| entry.payload)
        })
    }

    fn remove(&self, label: &str) -> Result<(), CommandError> {
        self.with_pending(|pending| {
            pending.remove(label);
        })
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.with_pending(|pending| pending.len()).unwrap_or(0)
    }

    #[cfg(test)]
    fn insert_with_age(&self, label: &str, payload: WindowTransferPayload, age: Duration) {
        let _ = self.with_pending(|pending| {
            pending.insert(
                label.to_string(),
                PendingTransfer {
                    payload,
                    created_at: Instant::now() - age,
                },
            );
        });
    }
}

/// 校验迁移负载：空标签、超量标签、超大内容与非法 activeIndex 直接拒绝。
pub fn validate_window_transfer(payload: &WindowTransferPayload) -> Result<(), CommandError> {
    if payload.tabs.is_empty() {
        return Err(CommandError::new("WINDOW_TRANSFER_EMPTY", "没有可迁移的标签"));
    }
    if payload.tabs.len() > WINDOW_TRANSFER_MAX_TABS {
        return Err(CommandError::new(
            "WINDOW_TRANSFER_TOO_LARGE",
            format!("一次最多迁移 {WINDOW_TRANSFER_MAX_TABS} 个标签"),
        ));
    }
    if payload.active_index >= payload.tabs.len() {
        return Err(CommandError::new(
            "WINDOW_TRANSFER_INVALID",
            "activeIndex 超出标签范围",
        ));
    }

    let total_bytes: usize = payload
        .tabs
        .iter()
        .map(|tab| tab.content.len())
        .sum();
    if total_bytes > WINDOW_TRANSFER_MAX_BYTES {
        return Err(CommandError::new(
            "WINDOW_TRANSFER_TOO_LARGE",
            format!("迁移内容超过 {} MB 上限", WINDOW_TRANSFER_MAX_BYTES / 1024 / 1024),
        ));
    }

    Ok(())
}

#[tauri::command]
pub fn open_editor_window(
    app: AppHandle,
    registry: State<'_, WindowTransferRegistry>,
    payload: WindowTransferPayload,
) -> Result<String, CommandError> {
    validate_window_transfer(&payload)?;
    let label = next_window_label(&app);
    // 先暂存 payload 再创建窗口，保证新窗口启动时能取到。
    registry.insert(&label, payload)?;

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Tau Editor")
        .inner_size(1180.0, 780.0)
        .min_inner_size(720.0, 480.0)
        .build();

    match window {
        Ok(_) => Ok(label),
        Err(error) => {
            registry.remove(&label)?;
            Err(CommandError::new(
                "WINDOW_CREATE_FAILED",
                format!("创建新窗口失败：{error}"),
            ))
        }
    }
}

#[tauri::command]
pub fn consume_window_transfer(
    window: WebviewWindow,
    registry: State<'_, WindowTransferRegistry>,
) -> Result<Option<WindowTransferPayload>, CommandError> {
    let label = window.label().to_string();
    if label == "main" {
        return Ok(None);
    }
    registry.take(&label)
}

fn next_window_label(app: &AppHandle) -> String {
    let base = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let mut suffix = 0;
    loop {
        let label = if suffix == 0 {
            format!("editor-{base}")
        } else {
            format!("editor-{base}-{suffix}")
        };
        if app.get_webview_window(&label).is_none() {
            return label;
        }
        suffix += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_tab(content: &str) -> WindowTransferTab {
        WindowTransferTab {
            file_path: Some("/tmp/a.ts".to_string()),
            file_name: "a.ts".to_string(),
            content: content.to_string(),
            is_dirty: true,
            is_untitled: false,
            language: Some("typescript".to_string()),
            cursor: Some(WindowTransferCursor { line: 1, column: 2 }),
        }
    }

    fn sample_payload(tabs: Vec<WindowTransferTab>) -> WindowTransferPayload {
        WindowTransferPayload {
            tabs,
            active_index: 0,
            source_workspace_path: None,
        }
    }

    #[test]
    fn validates_empty_and_oversized_payloads() {
        let empty = validate_window_transfer(&sample_payload(vec![]));
        assert_eq!(empty.unwrap_err().code, "WINDOW_TRANSFER_EMPTY");

        let too_many: Vec<_> = (0..(WINDOW_TRANSFER_MAX_TABS + 1))
            .map(|_| sample_tab("x"))
            .collect();
        let error = validate_window_transfer(&sample_payload(too_many)).unwrap_err();
        assert_eq!(error.code, "WINDOW_TRANSFER_TOO_LARGE");

        let oversized = validate_window_transfer(&sample_payload(vec![sample_tab(
            &"x".repeat(WINDOW_TRANSFER_MAX_BYTES + 1),
        )]))
        .unwrap_err();
        assert_eq!(oversized.code, "WINDOW_TRANSFER_TOO_LARGE");
    }

    #[test]
    fn rejects_out_of_range_active_index() {
        let mut payload = sample_payload(vec![sample_tab("a")]);
        payload.active_index = 3;
        let error = validate_window_transfer(&payload).unwrap_err();
        assert_eq!(error.code, "WINDOW_TRANSFER_INVALID");
    }

    #[test]
    fn payload_is_taken_once_and_expires() {
        let registry = WindowTransferRegistry::default();
        let payload = sample_payload(vec![sample_tab("hello")]);

        registry.insert("editor-1", payload.clone()).unwrap();
        assert_eq!(registry.len(), 1);

        let taken = registry.take("editor-1").unwrap();
        assert_eq!(taken, Some(payload));
        assert_eq!(registry.take("editor-1").unwrap(), None);

        registry
            .insert_with_age(
                "editor-expired",
                sample_payload(vec![sample_tab("stale")]),
                WINDOW_TRANSFER_TTL + Duration::from_secs(1),
            );
        assert_eq!(registry.take("editor-expired").unwrap(), None);
    }
}
