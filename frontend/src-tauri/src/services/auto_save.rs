/// 自动保存服务
/// 
/// 定期保存已修改但未保存的文件，支持原子写入和备份

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::time::{interval, MissedTickBehavior};
use tokio::fs;

/// 自动保存服务状态
#[derive(Debug, Clone)]
pub struct AutoSaveState {
    /// 是否启用
    pub enabled: bool,
    /// 保存间隔 (秒)
    pub interval_secs: u64,
    /// 待保存的文件列表 (path -> content)
    pub pending_files: HashMap<String, String>,
    /// 上次保存时间
    pub last_save_time: Option<Instant>,
    /// 防抖延迟 (毫秒)
    pub debounce_ms: u64,
}

impl Default for AutoSaveState {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_secs: 30,
            pending_files: HashMap::new(),
            last_save_time: None,
            debounce_ms: 500,
        }
    }
}

/// 自动保存服务
pub struct AutoSaveService {
    state: Arc<Mutex<AutoSaveState>>,
}

impl AutoSaveService {
    /// 创建新的自动保存服务
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(AutoSaveState::default())),
        }
    }

    /// 启用自动保存
    /// 
    /// # 参数
    /// * `interval_secs` - 保存间隔 (秒)
    pub fn enable(&self, interval_secs: u64) {
        let mut state = self.state.lock().unwrap();
        state.enabled = true;
        state.interval_secs = interval_secs.max(5); // 最小 5 秒
        log::info!("自动保存已启用，间隔：{}秒", state.interval_secs);
    }

    /// 禁用自动保存
    pub fn disable(&self) {
        let mut state = self.state.lock().unwrap();
        state.enabled = false;
        log::info!("自动保存已禁用");
    }

    /// 添加待保存的文件 (带防抖)
    /// 
    /// # 参数
    /// * `path` - 文件路径
    /// * `content` - 文件内容
    pub fn add_pending_file(&self, path: String, content: String) {
        let mut state = self.state.lock().unwrap();
        state.pending_files.insert(path, content);
        state.last_save_time = Some(Instant::now());
    }

    /// 移除已保存的文件
    /// 
    /// # 参数
    /// * `path` - 文件路径
    pub fn remove_pending_file(&self, path: &str) {
        let mut state = self.state.lock().unwrap();
        state.pending_files.remove(path);
    }

    /// 获取待保存文件数量
    pub fn pending_count(&self) -> usize {
        let state = self.state.lock().unwrap();
        state.pending_files.len()
    }

    /// 获取上次保存时间
    pub fn last_save_time(&self) -> Option<Instant> {
        let state = self.state.lock().unwrap();
        state.last_save_time
    }

    /// 设置防抖延迟
    pub fn set_debounce_ms(&self, debounce_ms: u64) {
        let mut state = self.state.lock().unwrap();
        state.debounce_ms = debounce_ms;
    }

    /// 原子写入文件
    /// 
    /// 先写入临时文件，然后原子性地重命名到目标路径
    /// 同时创建备份文件 (.bak)
    /// 
    /// # 参数
    /// * `path` - 目标文件路径
    /// * `content` - 文件内容
    async fn atomic_write<P: AsRef<Path>>(&self, path: P, content: &str) -> Result<(), String> {
        Self::atomic_write_inner(path.as_ref(), content).await
    }

    async fn atomic_write_inner(path: &Path, content: &str) -> Result<(), String> {
        
        // 确保父目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("创建目录失败：{}", e))?;
        }
        
        // 如果原文件存在，先创建备份
        if path.exists() {
            let backup_path = path.with_extension(format!(
                "{}.bak",
                path.extension()
                    .map(|s| s.to_string_lossy())
                    .unwrap_or_default()
            ));
            
            if let Err(e) = fs::copy(path, &backup_path).await {
                log::warn!("创建备份文件失败：{}", e);
                // 备份失败不影响主流程
            } else {
                log::debug!("已创建备份：{}", backup_path.display());
            }
        }
        
        // 写入临时文件
        let tmp_path = path.with_extension(format!(
            "{}.tmp",
            path.extension()
                .map(|s| s.to_string_lossy())
                .unwrap_or_default()
        ));
        
        fs::write(&tmp_path, content)
            .await
            .map_err(|e| format!("写入临时文件失败：{}", e))?;
        
        // 原子性地重命名
        fs::rename(&tmp_path, path)
            .await
            .map_err(|e| format!("重命名文件失败：{}", e))?;
        
        log::debug!("原子写入成功：{}", path.display());
        Ok(())
    }

    /// 运行自动保存循环 (带防抖)
    pub async fn run(&self) {
        let state = Arc::clone(&self.state);
        
        tokio::spawn(async move {
            let mut interval_timer = interval(Duration::from_secs(1)); // 每秒检查一次
            interval_timer.set_missed_tick_behavior(MissedTickBehavior::Skip);
            
            loop {
                interval_timer.tick().await;

                let files_to_save = {
                    let state_guard = state.lock().unwrap();
                    if !state_guard.enabled || state_guard.pending_files.is_empty() {
                        continue;
                    }

                    if let Some(last_save) = state_guard.last_save_time {
                        if last_save.elapsed().as_millis() < state_guard.debounce_ms as u128 {
                            continue;
                        }
                    }

                    state_guard
                        .pending_files
                        .iter()
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect::<Vec<_>>()
                };
                
                // 保存所有文件
                for (path, content) in files_to_save {
                    match Self::atomic_write_inner(Path::new(&path), &content).await {
                        Ok(_) => {
                            log::debug!("自动保存成功：{}", path);
                            // 移除已保存的文件
                            let mut state_guard = state.lock().unwrap();
                            state_guard.pending_files.remove(&path);
                            state_guard.last_save_time = Some(Instant::now());
                        }
                        Err(e) => {
                            log::error!("自动保存失败 ({}): {}", path, e);
                        }
                    }
                }
            }
        });
    }
}

impl Default for AutoSaveService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_auto_save_service_creation() {
        let service = AutoSaveService::new();
        assert!(!service.state.lock().unwrap().enabled);
        assert_eq!(service.state.lock().unwrap().interval_secs, 30);
    }
    
    #[test]
    fn test_enable_disable() {
        let service = AutoSaveService::new();
        service.enable(60);
        assert!(service.state.lock().unwrap().enabled);
        assert_eq!(service.state.lock().unwrap().interval_secs, 60);
        
        service.disable();
        assert!(!service.state.lock().unwrap().enabled);
    }
    
    #[test]
    fn test_pending_files() {
        let service = AutoSaveService::new();
        assert_eq!(service.pending_count(), 0);
        
        service.add_pending_file("/test.txt".to_string(), "content".to_string());
        assert_eq!(service.pending_count(), 1);
        
        service.remove_pending_file("/test.txt");
        assert_eq!(service.pending_count(), 0);
    }
}
