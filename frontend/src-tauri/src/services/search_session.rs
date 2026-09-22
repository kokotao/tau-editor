/**
 * @description 可取消工作区搜索的会话注册表：按 searchId 登记取消标记，支持过期清理
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-22 00:05
 */
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::models::CommandError;

/// 搜索会话的最长存活时间，超时视为失效并允许前端重新发起。
pub const SEARCH_SESSION_TIMEOUT_SECONDS: u64 = 300;

/// 搜索取消令牌；由搜索线程周期性检查。
#[derive(Clone, Debug, Default)]
pub struct SearchCancellation {
    flag: Arc<AtomicBool>,
}

impl SearchCancellation {
    pub fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::Relaxed)
    }

    pub fn cancel(&self) {
        self.flag.store(true, Ordering::Relaxed);
    }
}

struct SearchSessionEntry {
    cancellation: SearchCancellation,
    started_at: Instant,
}

/// 由 Tauri 托管的搜索会话表；同一时间可存在多个未完成搜索。
#[derive(Default)]
pub struct SearchSessionRegistry {
    sessions: Mutex<HashMap<String, SearchSessionEntry>>,
}

impl SearchSessionRegistry {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, HashMap<String, SearchSessionEntry>>, CommandError> {
        self.sessions
            .lock()
            .map_err(|_| CommandError::io("搜索会话注册表不可用"))
    }

    /// 登记一次搜索；searchId 为空或重复时返回结构化错误。
    pub fn begin(&self, search_id: &str) -> Result<SearchCancellation, CommandError> {
        if search_id.trim().is_empty() {
            return Err(CommandError::new("SEARCH_ID_REQUIRED", "搜索缺少 searchId"));
        }

        let mut sessions = self.lock()?;
        if sessions.contains_key(search_id) {
            return Err(CommandError::new(
                "SEARCH_IN_PROGRESS",
                "相同 searchId 的搜索仍在进行中",
            ));
        }

        let cancellation = SearchCancellation::default();
        sessions.insert(
            search_id.to_string(),
            SearchSessionEntry {
                cancellation: cancellation.clone(),
                started_at: Instant::now(),
            },
        );
        Ok(cancellation)
    }

    /// 取消进行中的搜索；searchId 已失效或不存在时返回 SEARCH_EXPIRED。
    pub fn cancel(&self, search_id: &str) -> Result<bool, CommandError> {
        let sessions = self.lock()?;
        let entry = sessions.get(search_id).ok_or_else(|| {
            CommandError::new("SEARCH_EXPIRED", "搜索已结束或已失效，请重新发起搜索")
        })?;
        entry.cancellation.cancel();
        Ok(true)
    }

    /// 搜索结束后回收会话，使后续同名 searchId 可复用。
    pub fn finish(&self, search_id: &str) {
        if let Ok(mut sessions) = self.lock() {
            sessions.remove(search_id);
        }
    }

    /// 清理超时未结束的搜索会话，避免异常退出后堆积。
    pub fn purge_expired(&self, now: Instant, timeout: Duration) -> usize {
        let Ok(mut sessions) = self.lock() else {
            return 0;
        };

        let expired: Vec<String> = sessions
            .iter()
            .filter(|(_, entry)| now.duration_since(entry.started_at) >= timeout)
            .map(|(id, _)| id.clone())
            .collect();

        for id in &expired {
            sessions.remove(id);
        }
        expired.len()
    }
}
