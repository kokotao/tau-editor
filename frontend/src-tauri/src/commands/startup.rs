use std::ffi::OsStr;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, Url};

pub const OPEN_FILE_EVENT: &str = "app:open-file-requested";

#[derive(Default)]
pub struct PendingOpenPaths(pub Mutex<Vec<String>>);

#[tauri::command]
pub fn consume_pending_open_paths(state: State<'_, PendingOpenPaths>) -> Vec<String> {
    let mut pending = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    std::mem::take(&mut *pending)
}

pub fn collect_startup_file_paths() -> Vec<String> {
    collect_paths_from_os_args(std::env::args_os().skip(1))
}

pub fn collect_file_paths_from_cli_args(args: &[String]) -> Vec<String> {
    collect_paths_from_os_args(args.iter().skip(1).map(OsStr::new))
}

pub fn collect_paths_from_urls(urls: &[Url]) -> Vec<String> {
    urls.iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter_map(normalize_existing_file_path)
        .fold(Vec::new(), |mut acc, path| {
            if !acc.contains(&path) {
                acc.push(path);
            }
            acc
        })
}

pub fn queue_pending_open_paths(app_handle: &AppHandle, incoming_paths: Vec<String>) {
    if incoming_paths.is_empty() {
        return;
    }

    let unique_paths = incoming_paths.into_iter().fold(Vec::new(), |mut acc, path| {
        if !acc.contains(&path) {
            acc.push(path);
        }
        acc
    });

    {
        let pending_state = app_handle.state::<PendingOpenPaths>();
        let mut pending = pending_state
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        for path in &unique_paths {
            if !pending.contains(path) {
                pending.push(path.clone());
            }
        }
    }

    let _ = app_handle.emit(OPEN_FILE_EVENT, &unique_paths);
}

fn resolve_arg_to_file_path(arg: &OsStr) -> Option<String> {
    let raw = arg.to_string_lossy().trim().to_string();
    if raw.is_empty() || raw.starts_with('-') {
        return None;
    }

    if let Ok(url) = Url::parse(&raw) {
        if url.scheme() == "file" {
            return url
                .to_file_path()
                .ok()
                .and_then(normalize_existing_file_path);
        }
    }

    normalize_existing_file_path(PathBuf::from(raw))
}

fn collect_paths_from_os_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: AsRef<OsStr>,
{
    args.into_iter()
        .filter_map(|arg| resolve_arg_to_file_path(arg.as_ref()))
        .fold(Vec::new(), |mut acc, path| {
            if !acc.contains(&path) {
                acc.push(path);
            }
            acc
        })
}

fn normalize_existing_file_path(path: PathBuf) -> Option<String> {
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir().ok()?.join(path)
    };

    let canonical = absolute.canonicalize().unwrap_or(absolute);
    if canonical.is_file() {
        Some(canonical.to_string_lossy().to_string())
    } else {
        None
    }
}
