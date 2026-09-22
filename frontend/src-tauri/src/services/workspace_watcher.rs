/**
 * @description 工作区文件监听服务：监听工作区目录、去抖合并事件、过滤自身临时文件并通过 Tauri 事件推送
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-09-21 23:35
 */
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};

use notify::event::{ModifyKind, RenameMode};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::models::{
    CommandError, WorkspaceChangeKind, WorkspaceFileChange, WorkspaceWatchStatus,
    DEFAULT_WATCH_DEBOUNCE_MS, MAX_WATCH_DEBOUNCE_MS, MIN_WATCH_DEBOUNCE_MS,
    WORKSPACE_FILE_CHANGED_EVENT,
};

const IGNORED_DIRECTORIES: [&str; 6] = [".git", "node_modules", "target", "dist", ".next", ".idea"];
const IGNORED_FILE_NAMES: [&str; 3] = [".DS_Store", "Thumbs.db", "desktop.ini"];
const MAX_BATCH_SIZE: usize = 200;

enum WatchMessage {
    Event(Box<Event>),
    Stop,
}

struct ActiveWatch {
    root: PathBuf,
    debounce_ms: u64,
    watcher: RecommendedWatcher,
    stop_tx: Sender<WatchMessage>,
}

/// 由 Tauri 托管的监听状态，同一时间只监听一个工作区根目录。
#[derive(Default)]
pub struct WorkspaceWatcherState {
    active: Mutex<Option<ActiveWatch>>,
}

impl WorkspaceWatcherState {
    pub fn start(
        &self,
        app: AppHandle,
        root: &Path,
        debounce_ms: u64,
    ) -> Result<WorkspaceWatchStatus, CommandError> {
        if !root.is_dir() {
            return Err(CommandError::new(
                "WATCH_ROOT_INVALID",
                format!("监听目录不存在或不是目录：{}", root.display()),
            ));
        }

        self.stop();

        let (tx, rx) = mpsc::channel::<WatchMessage>();
        let event_tx = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |result: Result<Event, notify::Error>| match result {
                Ok(event) => {
                    let _ = event_tx.send(WatchMessage::Event(Box::new(event)));
                }
                Err(error) => log::warn!("工作区监听事件错误：{error}"),
            },
            Config::default(),
        )
        .map_err(|error| {
            CommandError::new("WATCH_START_FAILED", format!("创建文件监听器失败：{error}"))
        })?;

        watcher
            .watch(root, RecursiveMode::Recursive)
            .map_err(|error| {
                CommandError::new("WATCH_START_FAILED", format!("监听目录失败：{error}"))
            })?;

        let emit_app = app.clone();
        std::thread::spawn(move || {
            run_event_loop(rx, Duration::from_millis(debounce_ms), move |changes| {
                if changes.is_empty() {
                    return;
                }
                if let Err(error) = emit_app.emit(WORKSPACE_FILE_CHANGED_EVENT, &changes) {
                    log::warn!("推送文件变更事件失败：{error}");
                }
            });
        });

        let root_path = root.to_path_buf();
        let mut guard = lock_state(&self.active);
        *guard = Some(ActiveWatch {
            root: root_path.clone(),
            debounce_ms,
            watcher,
            stop_tx: tx,
        });

        Ok(WorkspaceWatchStatus {
            watching: true,
            root_path: Some(root_path.to_string_lossy().to_string()),
            debounce_ms,
        })
    }

    pub fn stop(&self) -> WorkspaceWatchStatus {
        let mut guard = lock_state(&self.active);
        let debounce_ms = guard
            .as_ref()
            .map(|active| active.debounce_ms)
            .unwrap_or(DEFAULT_WATCH_DEBOUNCE_MS);
        if let Some(active) = guard.take() {
            let _ = active.stop_tx.send(WatchMessage::Stop);
            drop(active.watcher);
        }
        WorkspaceWatchStatus::idle(debounce_ms)
    }

    pub fn status(&self) -> WorkspaceWatchStatus {
        let guard = lock_state(&self.active);
        match guard.as_ref() {
            Some(active) => WorkspaceWatchStatus {
                watching: true,
                root_path: Some(active.root.to_string_lossy().to_string()),
                debounce_ms: active.debounce_ms,
            },
            None => WorkspaceWatchStatus::idle(DEFAULT_WATCH_DEBOUNCE_MS),
        }
    }
}

fn lock_state(
    state: &Mutex<Option<ActiveWatch>>,
) -> std::sync::MutexGuard<'_, Option<ActiveWatch>> {
    state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn normalize_debounce_ms(value: Option<u64>) -> u64 {
    value
        .unwrap_or(DEFAULT_WATCH_DEBOUNCE_MS)
        .clamp(MIN_WATCH_DEBOUNCE_MS, MAX_WATCH_DEBOUNCE_MS)
}

/// 过滤自身临时文件、编辑器交换文件与被忽略目录。
pub fn should_ignore_path(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return true;
    };
    if name.ends_with(".tmp") || name.ends_with(".swp") || name.ends_with('~') {
        return true;
    }
    if IGNORED_FILE_NAMES.contains(&name) {
        return true;
    }
    path.components().any(|component| match component {
        Component::Normal(segment) => segment
            .to_str()
            .map(|segment| IGNORED_DIRECTORIES.contains(&segment))
            .unwrap_or(false),
        _ => false,
    })
}

/// 把 notify 原始事件映射为前端可消费的变更列表。
pub fn change_from_event(event: &Event) -> Vec<WorkspaceFileChange> {
    let paths = event.paths.as_slice();
    match event.kind {
        EventKind::Access(_) => Vec::new(),
        EventKind::Create(_) => paths
            .iter()
            .filter(|path| !should_ignore_path(path))
            .map(|path| new_change(path, WorkspaceChangeKind::Created, None))
            .collect(),
        EventKind::Remove(_) => paths
            .iter()
            .filter(|path| !should_ignore_path(path))
            .map(|path| new_change(path, WorkspaceChangeKind::Removed, None))
            .collect(),
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => paths
            .iter()
            .filter(|path| !should_ignore_path(path))
            .map(|path| new_change(path, WorkspaceChangeKind::Removed, None))
            .collect(),
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => paths
            .iter()
            .filter(|path| !should_ignore_path(path))
            .map(|path| new_change(path, WorkspaceChangeKind::Created, None))
            .collect(),
        EventKind::Modify(ModifyKind::Name(_)) => rename_changes(paths),
        EventKind::Modify(_) | EventKind::Any => paths
            .iter()
            .filter(|path| !should_ignore_path(path))
            .map(|path| new_change(path, WorkspaceChangeKind::Modified, None))
            .collect(),
        EventKind::Other => Vec::new(),
    }
}

fn rename_changes(paths: &[PathBuf]) -> Vec<WorkspaceFileChange> {
    if paths.len() < 2 {
        return paths
            .iter()
            .filter(|path| !should_ignore_path(path))
            .map(|path| new_change(path, WorkspaceChangeKind::Modified, None))
            .collect();
    }

    let old = &paths[0];
    let new = &paths[1];
    let old_ignored = should_ignore_path(old);
    let new_ignored = should_ignore_path(new);

    // 原子替换写入会表现为「临时文件 -> 目标文件」的改名，等价于目标文件被修改。
    if new_ignored {
        return Vec::new();
    }
    if old_ignored {
        return vec![new_change(new, WorkspaceChangeKind::Modified, None)];
    }

    vec![new_change(
        new,
        WorkspaceChangeKind::Renamed,
        Some(old.to_string_lossy().to_string()),
    )]
}

fn new_change(
    path: &Path,
    kind: WorkspaceChangeKind,
    old_path: Option<String>,
) -> WorkspaceFileChange {
    WorkspaceFileChange {
        path: path.to_string_lossy().to_string(),
        old_path,
        kind,
        modified_ms: None,
        size: None,
    }
}

/// 合并同一路径在去抖窗口内的多次变更。
pub fn coalesce(
    existing: WorkspaceFileChange,
    incoming: WorkspaceFileChange,
) -> WorkspaceFileChange {
    // 原子替换写入在部分平台会先报删除再报创建，最终应视为修改。
    if existing.kind == WorkspaceChangeKind::Removed
        && incoming.kind == WorkspaceChangeKind::Created
    {
        return WorkspaceFileChange {
            kind: WorkspaceChangeKind::Modified,
            old_path: existing.old_path.or(incoming.old_path),
            ..incoming
        };
    }

    incoming
}

fn upsert(pending: &mut BTreeMap<PathBuf, WorkspaceFileChange>, change: WorkspaceFileChange) {
    let key = PathBuf::from(&change.path);
    match pending.remove(&key) {
        Some(existing) => {
            pending.insert(key, coalesce(existing, change));
        }
        None => {
            pending.insert(key, change);
        }
    }
}

/// 补齐最终磁盘状态，供前端判断是否需要弹出冲突。
pub fn refresh_metadata(change: &mut WorkspaceFileChange) {
    if change.kind == WorkspaceChangeKind::Removed {
        change.modified_ms = None;
        change.size = None;
        return;
    }

    match std::fs::metadata(&change.path) {
        Ok(metadata) => {
            change.size = Some(metadata.len());
            change.modified_ms = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis().try_into().unwrap_or(u64::MAX));
        }
        Err(_) => {
            change.modified_ms = None;
            change.size = None;
        }
    }
}

fn flush(
    pending: &mut BTreeMap<PathBuf, WorkspaceFileChange>,
    sink: &mut impl FnMut(Vec<WorkspaceFileChange>),
) {
    if pending.is_empty() {
        return;
    }

    let mut batch: Vec<WorkspaceFileChange> =
        pending.values().take(MAX_BATCH_SIZE).cloned().collect();
    pending.clear();
    for change in batch.iter_mut() {
        refresh_metadata(change);
    }
    batch.sort_by(|left, right| left.path.cmp(&right.path));
    sink(batch);
}

/// 去抖事件循环：静默 `debounce` 后把这一批变更交给 sink。
fn run_event_loop(
    rx: Receiver<WatchMessage>,
    debounce: Duration,
    mut sink: impl FnMut(Vec<WorkspaceFileChange>),
) {
    let mut pending: BTreeMap<PathBuf, WorkspaceFileChange> = BTreeMap::new();
    let mut deadline: Option<Instant> = None;

    loop {
        let timeout = deadline
            .map(|value| value.saturating_duration_since(Instant::now()))
            .unwrap_or(debounce);
        match rx.recv_timeout(timeout) {
            Ok(WatchMessage::Event(event)) => {
                for change in change_from_event(&event) {
                    upsert(&mut pending, change);
                }
                if !pending.is_empty() {
                    deadline = Some(Instant::now() + debounce);
                }
            }
            Ok(WatchMessage::Stop) => break,
            Err(RecvTimeoutError::Timeout) => {
                if let Some(value) = deadline {
                    if value <= Instant::now() {
                        flush(&mut pending, &mut sink);
                        deadline = None;
                    }
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }

    flush(&mut pending, &mut sink);
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, RemoveKind};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tempfile::tempdir;

    fn event(kind: EventKind, paths: Vec<PathBuf>) -> Event {
        Event {
            kind,
            paths,
            attrs: Default::default(),
        }
    }

    #[test]
    fn ignores_temp_files_and_dependency_directories() {
        assert!(should_ignore_path(Path::new("/ws/src/.main.rs.tau-7.tmp")));
        assert!(should_ignore_path(Path::new("/ws/src/main.rs.tmp")));
        assert!(should_ignore_path(Path::new(
            "/ws/node_modules/pkg/index.js"
        )));
        assert!(should_ignore_path(Path::new("/ws/.git/HEAD")));
        assert!(should_ignore_path(Path::new("/ws/target/debug/app")));
        assert!(should_ignore_path(Path::new("/ws/.DS_Store")));
        assert!(!should_ignore_path(Path::new("/ws/src/main.rs")));
    }

    #[test]
    fn maps_remove_and_create_into_modified_when_replacing() {
        let changes = change_from_event(&event(
            EventKind::Remove(RemoveKind::File),
            vec![PathBuf::from("/ws/notes.md")],
        ));
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].kind, WorkspaceChangeKind::Removed);

        let created = new_change(
            Path::new("/ws/notes.md"),
            WorkspaceChangeKind::Created,
            None,
        );
        let coalesced = coalesce(changes[0].clone(), created);
        assert_eq!(coalesced.kind, WorkspaceChangeKind::Modified);
        assert_eq!(coalesced.path, "/ws/notes.md");
    }

    #[test]
    fn treats_temp_to_target_rename_as_modify() {
        let changes = change_from_event(&event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            vec![
                PathBuf::from("/ws/.notes.md.tau-1.tmp"),
                PathBuf::from("/ws/notes.md"),
            ],
        ));
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].kind, WorkspaceChangeKind::Modified);
        assert_eq!(changes[0].path, "/ws/notes.md");
    }

    #[test]
    fn keeps_user_renames_as_renamed() {
        let changes = change_from_event(&event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            vec![PathBuf::from("/ws/old.md"), PathBuf::from("/ws/new.md")],
        ));
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].kind, WorkspaceChangeKind::Renamed);
        assert_eq!(changes[0].path, "/ws/new.md");
        assert_eq!(changes[0].old_path.as_deref(), Some("/ws/old.md"));
    }

    #[test]
    fn ignores_access_events() {
        let changes = change_from_event(&event(
            EventKind::Access(notify::event::AccessKind::Read),
            vec![PathBuf::from("/ws/notes.md")],
        ));
        assert!(changes.is_empty());
    }

    #[test]
    fn watch_loop_emits_debounced_changes_and_skips_temp_files() {
        let directory = tempdir().expect("temp dir");
        let root = directory.path().to_path_buf();
        let (tx, rx) = mpsc::channel::<WatchMessage>();
        let watcher_tx = tx.clone();
        let mut watcher = RecommendedWatcher::new(
            move |result: Result<Event, notify::Error>| {
                if let Ok(event) = result {
                    let _ = watcher_tx.send(WatchMessage::Event(Box::new(event)));
                }
            },
            Config::default(),
        )
        .expect("watcher");
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .expect("watch root");

        let received = Arc::new(Mutex::new(Vec::<WorkspaceFileChange>::new()));
        let sink_state = received.clone();
        let finished = Arc::new(AtomicBool::new(false));
        let finished_flag = finished.clone();
        let loop_thread = std::thread::spawn(move || {
            run_event_loop(rx, Duration::from_millis(80), move |batch| {
                sink_state
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .extend(batch);
            });
            finished_flag.store(true, Ordering::SeqCst);
        });

        std::fs::write(root.join("notes.md"), "hello").expect("write file");
        std::fs::write(root.join(".notes.md.tau-1.tmp"), "temp").expect("write temp");

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let seen = received
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .iter()
                .any(|change| change.path.ends_with("notes.md"));
            if seen || Instant::now() > deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }

        let _ = tx.send(WatchMessage::Stop);
        loop_thread.join().expect("join watcher loop");

        let changes = received
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        assert!(
            changes
                .iter()
                .any(|change| change.path.ends_with("notes.md")),
            "expected notes.md change, got {changes:?}"
        );
        assert!(
            !changes
                .iter()
                .any(|change| change.path.contains(".tau-1.tmp")),
            "temp files must be ignored, got {changes:?}"
        );
    }

    #[test]
    fn create_event_maps_to_created() {
        let changes = change_from_event(&event(
            EventKind::Create(CreateKind::File),
            vec![PathBuf::from("/ws/src/new.rs")],
        ));
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].kind, WorkspaceChangeKind::Created);
    }
}
