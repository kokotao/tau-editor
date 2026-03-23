/// 文件监听服务
/// 
/// 使用 notify crate 监听文件系统变化

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use notify::event::{ModifyKind, RenameMode};

/// 文件事件类型
#[derive(Debug, Clone)]
pub enum FileEvent {
    /// 文件被修改
    Modified(PathBuf),
    /// 文件被创建
    Created(PathBuf),
    /// 文件被删除
    Removed(PathBuf),
    /// 文件被重命名
    Renamed { old: PathBuf, new: PathBuf },
}

/// 文件监听器配置
#[derive(Debug, Clone)]
pub struct WatcherConfig {
    /// 是否递归监听子目录
    pub recursive: bool,
    /// 监听超时 (毫秒)
    pub timeout_ms: u64,
    /// 防抖间隔 (毫秒)
    pub debounce_ms: u64,
}

impl Default for WatcherConfig {
    fn default() -> Self {
        Self {
            recursive: true,
            timeout_ms: 1000,
            debounce_ms: 100,
        }
    }
}

/// 文件监听服务状态
#[derive(Debug)]
struct WatcherState {
    /// 正在监听的路径
    watched_paths: Vec<PathBuf>,
    /// 事件发送器
    event_tx: Option<mpsc::Sender<FileEvent>>,
    /// notify watcher
    watcher: Option<RecommendedWatcher>,
}

/// 文件监听服务
pub struct FileWatcherService {
    state: Arc<Mutex<WatcherState>>,
    config: WatcherConfig,
}

impl FileWatcherService {
    /// 创建新的文件监听服务
    pub fn new(config: WatcherConfig) -> Self {
        Self {
            state: Arc::new(Mutex::new(WatcherState {
                watched_paths: Vec::new(),
                event_tx: None,
                watcher: None,
            })),
            config,
        }
    }

    /// 创建带默认配置的文件监听服务
    pub fn with_default_config() -> Self {
        Self::new(WatcherConfig::default())
    }

    /// 设置事件通道
    pub fn set_event_channel(&self, tx: mpsc::Sender<FileEvent>) {
        let mut state = self.state.lock().unwrap();
        state.event_tx = Some(tx);
    }

    /// 添加监听路径
    /// 
    /// # 参数
    /// * `path` - 要监听的路径
    /// 
    /// # 返回
    /// * `Result<(), String>` - 成功或错误信息
    pub fn watch<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let path = path.as_ref().to_path_buf();
        
        if !path.exists() {
            return Err(format!("路径不存在：{}", path.display()));
        }
        
        let mut state = self.state.lock().unwrap();
        
        // 检查是否已在监听
        if state.watched_paths.contains(&path) {
            return Err(format!("路径已在监听中：{}", path.display()));
        }
        
        // 如果 watcher 已初始化，添加到监听
        if let Some(watcher) = &mut state.watcher {
            let recursive_mode = if self.config.recursive { 
                RecursiveMode::Recursive 
            } else { 
                RecursiveMode::NonRecursive 
            };
            watcher.watch(&path, recursive_mode)
                .map_err(|e| format!("添加监听失败：{}", e))?;
        }
        
        state.watched_paths.push(path.clone());
        log::info!("开始监听路径：{}", path.display());
        
        Ok(())
    }

    /// 移除监听路径
    /// 
    /// # 参数
    /// * `path` - 要停止监听的路径
    pub fn unwatch<P: AsRef<Path>>(&self, path: P) {
        let path = path.as_ref().to_path_buf();
        let mut state = self.state.lock().unwrap();
        
        if let Some(pos) = state.watched_paths.iter().position(|p| p == &path) {
            // 如果 watcher 已初始化，从监听中移除
            if let Some(watcher) = &mut state.watcher {
                let _ = watcher.unwatch(&path);
            }
            state.watched_paths.remove(pos);
            log::info!("停止监听路径：{}", path.display());
        }
    }

    /// 获取所有监听路径
    pub fn watched_paths(&self) -> Vec<PathBuf> {
        let state = self.state.lock().unwrap();
        state.watched_paths.clone()
    }

    /// 初始化 notify watcher
    pub fn init_watcher(&self) -> Result<(), String> {
        let debounce_ms = self.config.debounce_ms;
        let (tx, _rx) = mpsc::channel(100);
        
        let watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    // 简单的防抖：忽略重复事件
                    match event.kind {
                        EventKind::Create(_) => {
                            for path in event.paths {
                                let _ = tx.blocking_send(FileEvent::Created(path));
                            }
                        }
                        EventKind::Remove(_) => {
                            for path in event.paths {
                                let _ = tx.blocking_send(FileEvent::Removed(path));
                            }
                        }
                        EventKind::Modify(ModifyKind::Name(RenameMode::Both)) => {
                            if event.paths.len() >= 2 {
                                let _ = tx.blocking_send(FileEvent::Renamed {
                                    old: event.paths[0].clone(),
                                    new: event.paths[1].clone(),
                                });
                            }
                        }
                        EventKind::Modify(ModifyKind::Name(_)) => {
                            for path in event.paths {
                                let _ = tx.blocking_send(FileEvent::Modified(path));
                            }
                        }
                        EventKind::Modify(_) => {
                            for path in event.paths {
                                let _ = tx.blocking_send(FileEvent::Modified(path));
                            }
                        }
                        _ => {}
                    }
                }
            },
            Config::default().with_poll_interval(std::time::Duration::from_millis(debounce_ms)),
        ).map_err(|e| format!("创建 watcher 失败：{}", e))?;
        
        let mut state = self.state.lock().unwrap();
        state.watcher = Some(watcher);
        
        // 监听所有已添加的路径
        let recursive_mode = if self.config.recursive { 
            RecursiveMode::Recursive 
        } else { 
            RecursiveMode::NonRecursive 
        };
        
        let watched_paths = state.watched_paths.clone();
        if let Some(watcher) = &mut state.watcher {
            for path in &watched_paths {
                let _ = watcher.watch(path, recursive_mode);
            }
        }
        
        log::info!("文件监听器已初始化");
        Ok(())
    }

    /// 运行文件监听循环
    pub async fn run(&self) {
        log::info!("文件监听服务已启动");
        
        // 初始化 watcher
        if let Err(e) = self.init_watcher() {
            log::error!("初始化文件监听器失败：{}", e);
            return;
        }
        
        // 保持服务运行
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
        }
    }
}

impl Default for FileWatcherService {
    fn default() -> Self {
        Self::with_default_config()
    }
}

/// 创建文件监听服务并返回事件接收器
/// 
/// # 返回
/// * `(FileWatcherService, mpsc::Receiver<FileEvent>)` - 服务和事件接收器
pub fn create_watcher_with_channel() -> (FileWatcherService, mpsc::Receiver<FileEvent>) {
    let (tx, rx) = mpsc::channel(100);
    let service = FileWatcherService::with_default_config();
    service.set_event_channel(tx);
    (service, rx)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_watcher_creation() {
        let watcher = FileWatcherService::new(WatcherConfig::default());
        assert!(watcher.watched_paths().is_empty());
    }
    
    #[test]
    fn test_watcher_config() {
        let config = WatcherConfig {
            recursive: false,
            timeout_ms: 500,
            debounce_ms: 200,
        };
        let watcher = FileWatcherService::new(config.clone());
        // 配置已设置
    }
}
