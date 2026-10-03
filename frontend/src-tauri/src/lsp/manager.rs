/**
 * @description 工作区语言服务器 Supervisor：按 sessionId 复用、查询和停止 LSP 进程
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:10
 */
use std::collections::HashMap;
use std::sync::Arc;

use tauri::AppHandle;
use tokio::sync::Mutex;

use crate::models::{
    CommandError, LspNotification, LspRequest, LspResponse, LspSessionStatus, LspStartRequest,
    LspStatusResponse,
};

use super::process::LspSession;

/// Tauri 全局托管的 LSP 会话注册表。
#[derive(Default)]
pub struct LspSupervisor {
    sessions: Mutex<HashMap<String, Arc<LspSession>>>,
    scopes: Mutex<HashMap<(String, String), String>>,
}

impl LspSupervisor {
    /// 启动并登记一个语言服务器会话；同一 sessionId 不能重复启动。
    pub async fn start(
        &self,
        request: LspStartRequest,
        app: Option<AppHandle>,
    ) -> Result<LspSessionStatus, CommandError> {
        let scope = (request.workspace_id.clone(), request.language_id.clone());
        {
            let sessions = self.sessions.lock().await;
            if sessions.contains_key(&request.session_id) {
                return Err(CommandError::new(
                    "LSP_SESSION_EXISTS",
                    "相同 sessionId 的语言服务器会话已存在",
                ));
            }
        }
        {
            let scopes = self.scopes.lock().await;
            if let Some(existing_session_id) = scopes.get(&scope) {
                return Err(CommandError::new(
                    "LSP_SCOPE_EXISTS",
                    format!(
                        "相同 workspaceId + languageId 的语言服务器会话已存在：{existing_session_id}"
                    ),
                ));
            }
        }

        let session_id = request.session_id.clone();
        let session = Arc::new(LspSession::spawn(request, app).await?);
        let mut sessions = self.sessions.lock().await;
        if sessions.contains_key(&session_id) {
            // 并发启动竞争时回收刚创建的进程，避免泄漏。
            let _ = session.stop().await;
            return Err(CommandError::new(
                "LSP_SESSION_EXISTS",
                "相同 sessionId 的语言服务器会话已存在",
            ));
        }
        let status = session.status().await;
        sessions.insert(session_id.clone(), session);
        drop(sessions);
        let mut scopes = self.scopes.lock().await;
        if let Some(existing_session_id) = scopes.get(&scope).cloned() {
            // 极端并发启动下作用域检查与插入之间发生竞争，回收后登记的会话。
            drop(scopes);
            let new_session = self.sessions.lock().await.remove(&session_id);
            if let Some(new_session) = new_session {
                let _ = new_session.stop().await;
            }
            return Err(CommandError::new(
                "LSP_SCOPE_EXISTS",
                format!(
                    "相同 workspaceId + languageId 的语言服务器会话已存在：{existing_session_id}"
                ),
            ));
        }
        scopes.insert(scope, session_id);
        Ok(status)
    }

    /// 停止并移除一个语言服务器会话。
    pub async fn stop(&self, session_id: &str) -> Result<LspSessionStatus, CommandError> {
        let session = self.get(session_id).await?;
        let status = session.stop().await?;
        self.sessions.lock().await.remove(session_id);
        self.scopes
            .lock()
            .await
            .retain(|_, value| value != session_id);
        Ok(status)
    }

    /// 向指定会话转发 JSON-RPC 请求。
    pub async fn request(&self, request: LspRequest) -> Result<LspResponse, CommandError> {
        let session = self.get(&request.session_id).await?;
        session.request(&request.method, request.params).await
    }

    /// 向指定会话转发 JSON-RPC 通知。
    pub async fn notify(&self, notification: LspNotification) -> Result<(), CommandError> {
        let session = self.get(&notification.session_id).await?;
        session
            .notify(&notification.method, notification.params)
            .await
    }

    /// 查询单个或全部会话状态。
    pub async fn status(
        &self,
        session_id: Option<&str>,
    ) -> Result<LspStatusResponse, CommandError> {
        if let Some(session_id) = session_id {
            let session = self.get(session_id).await?;
            return Ok(LspStatusResponse {
                sessions: vec![session.status().await],
            });
        }

        let sessions: Vec<Arc<LspSession>> = {
            let sessions = self.sessions.lock().await;
            sessions.values().cloned().collect()
        };
        let mut statuses = Vec::with_capacity(sessions.len());
        for session in sessions {
            statuses.push(session.status().await);
        }
        statuses.sort_by(|left, right| left.session_id.cmp(&right.session_id));
        Ok(LspStatusResponse { sessions: statuses })
    }

    async fn get(&self, session_id: &str) -> Result<Arc<LspSession>, CommandError> {
        if session_id.trim().is_empty() {
            return Err(CommandError::new(
                "LSP_SESSION_REQUIRED",
                "缺少 LSP sessionId",
            ));
        }
        self.sessions
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| CommandError::new("LSP_SESSION_NOT_FOUND", "LSP 会话不存在或已停止"))
    }
}
