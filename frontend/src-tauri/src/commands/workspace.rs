/**
 * @description 基于 WorkspaceId 的安全文件访问与条件原子写入命令
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-07-16 10:00
 */
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::models::{CommandError, FileRevision, WriteFileResponse};

static NEXT_WORKSPACE_ID: AtomicU64 = AtomicU64::new(1);
const MAX_DIRECT_WRITE_BYTES: usize = 4 * 1024 * 1024;

/// 仅在当前应用运行期保存的工作区根目录注册表。
#[derive(Default)]
pub struct WorkspaceRegistry {
    roots: Mutex<HashMap<String, PathBuf>>,
    write_locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedWorkspace {
    pub workspace_id: String,
    pub root_path: String,
}

/// 注册工作区，返回仅在当前运行期有效的不透明 ID。
#[tauri::command]
pub fn resolve_workspace(
    registry: State<'_, WorkspaceRegistry>,
    path: String,
) -> Result<ResolvedWorkspace, CommandError> {
    resolve_workspace_for_registry(registry.inner(), &path)
}

/// 查询工作区中单个文件的 revision。
#[tauri::command]
pub fn get_file_revision(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_path: String,
    include_hash: Option<bool>,
) -> Result<FileRevision, CommandError> {
    get_file_revision_for_registry(
        registry.inner(),
        &workspace_id,
        &relative_path,
        include_hash.unwrap_or(false),
    )
}

/// 仅当磁盘 revision 仍匹配时才原子覆盖文件。
#[tauri::command]
pub fn write_file_if_revision(
    registry: State<'_, WorkspaceRegistry>,
    workspace_id: String,
    relative_path: String,
    content: String,
    expected_revision: String,
) -> Result<WriteFileResponse, CommandError> {
    write_file_if_revision_for_registry(
        registry.inner(),
        &workspace_id,
        &relative_path,
        &content,
        &expected_revision,
    )
}

/// 可在 Rust 测试与后续命令中复用的工作区解析函数。
pub fn resolve_workspace_for_registry(
    registry: &WorkspaceRegistry,
    path: &str,
) -> Result<ResolvedWorkspace, CommandError> {
    reject_empty_or_nul(path)?;
    let root = fs::canonicalize(path).map_err(|error| {
        CommandError::new("WORKSPACE_NOT_FOUND", format!("无法打开工作区：{error}"))
    })?;

    if !root.is_dir() {
        return Err(CommandError::new("WORKSPACE_NOT_FOUND", "工作区必须是目录"));
    }

    let workspace_id = create_workspace_id(&root);
    registry
        .roots
        .lock()
        .map_err(|_| CommandError::io("工作区注册表不可用"))?
        .insert(workspace_id.clone(), root.clone());

    Ok(ResolvedWorkspace {
        workspace_id,
        root_path: root.to_string_lossy().into_owned(),
    })
}

/// 可在 Rust 测试与后续命令中复用的 revision 查询函数。
pub fn get_file_revision_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    include_hash: bool,
) -> Result<FileRevision, CommandError> {
    if include_hash {
        return Err(CommandError::new(
            "HASH_UNSUPPORTED",
            "当前版本不支持内容哈希 revision，请使用标准 revision",
        ));
    }
    let path = resolve_workspace_path(registry, workspace_id, relative_path)?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(CommandError::new(
            "SYMLINK_ESCAPE",
            "不支持通过符号链接访问文件",
        )),
        Ok(metadata) if !metadata.is_file() => Err(CommandError::new(
            "NOT_A_FILE",
            "目标路径不是普通文件",
        )),
        Ok(_) => {
            let metadata = fs::metadata(&path)
                .map_err(|error| CommandError::io(format!("无法读取文件元数据：{error}")))?;
            FileRevision::from_metadata(&metadata)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(FileRevision::missing()),
        Err(error) => Err(CommandError::io(format!("无法读取文件元数据：{error}"))),
    }
}

/// 可在 Rust 测试与后续命令中复用的条件原子写入函数。
pub fn write_file_if_revision_for_registry(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    content: &str,
    expected_revision: &str,
) -> Result<WriteFileResponse, CommandError> {
    write_file_if_revision_with_before_commit(
        registry,
        workspace_id,
        relative_path,
        content,
        expected_revision,
        || {},
    )
}

#[doc(hidden)]
pub fn write_file_if_revision_with_before_commit_for_test<F>(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    content: &str,
    expected_revision: &str,
    before_commit: F,
) -> Result<WriteFileResponse, CommandError>
where
    F: FnOnce(),
{
    write_file_if_revision_with_before_commit(
        registry,
        workspace_id,
        relative_path,
        content,
        expected_revision,
        before_commit,
    )
}

fn write_file_if_revision_with_before_commit<F>(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
    content: &str,
    expected_revision: &str,
    before_commit: F,
) -> Result<WriteFileResponse, CommandError>
where
    F: FnOnce(),
{
    if content.len() > MAX_DIRECT_WRITE_BYTES {
        return Err(CommandError::new(
            "TOO_LARGE",
            "直接条件写入最大支持 4MiB，请使用分段写入事务",
        ));
    }
    let path = resolve_workspace_path(registry, workspace_id, relative_path)?;
    let write_lock = get_write_lock(registry, &path)?;
    let _write_guard = write_lock
        .lock()
        .map_err(|_| CommandError::io("文件写入锁不可用"))?;

    ensure_expected_revision(&path, expected_revision)?;
    before_commit();

    let revalidated_path = resolve_workspace_path(registry, workspace_id, relative_path)?;
    if revalidated_path != path {
        return Err(CommandError::new("FILE_CONFLICT", "文件路径在写入期间发生变化"));
    }
    ensure_expected_revision(&path, expected_revision)?;

    atomic_write(&path, content.as_bytes())?;
    let revision = fs::metadata(&path)
        .map_err(|error| CommandError::io(format!("无法读取写入后的文件元数据：{error}")))?;
    let revision = FileRevision::from_metadata(&revision)?
        .revision
        .ok_or_else(|| CommandError::io("写入后的文件缺少 revision"))?;

    Ok(WriteFileResponse { revision })
}

fn ensure_expected_revision(path: &Path, expected_revision: &str) -> Result<(), CommandError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => CommandError::new("FILE_NOT_FOUND", "目标文件不存在"),
        _ => CommandError::io(format!("无法读取文件元数据：{error}")),
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(CommandError::new("NOT_A_FILE", "目标路径不是普通文件"));
    }
    let current = FileRevision::from_metadata(&metadata)?;
    if current.revision.as_deref() != Some(expected_revision) {
        return Err(CommandError::new("FILE_CONFLICT", "文件已被外部修改"));
    }
    Ok(())
}

fn get_write_lock(
    registry: &WorkspaceRegistry,
    path: &Path,
) -> Result<Arc<Mutex<()>>, CommandError> {
    let mut locks = registry
        .write_locks
        .lock()
        .map_err(|_| CommandError::io("文件写入锁注册表不可用"))?;
    Ok(locks
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone())
}

fn resolve_workspace_path(
    registry: &WorkspaceRegistry,
    workspace_id: &str,
    relative_path: &str,
) -> Result<PathBuf, CommandError> {
    reject_empty_or_nul(relative_path)?;
    let root = registry
        .roots
        .lock()
        .map_err(|_| CommandError::io("工作区注册表不可用"))?
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| CommandError::new("WORKSPACE_NOT_FOUND", "工作区已失效，请重新打开"))?;
    let current_root = fs::canonicalize(&root).map_err(|error| {
        CommandError::new("WORKSPACE_NOT_FOUND", format!("工作区已不可用：{error}"))
    })?;
    if current_root != root || !current_root.is_dir() {
        return Err(CommandError::new("SYMLINK_ESCAPE", "工作区根目录已发生变化"));
    }

    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(CommandError::new(
            "PATH_OUTSIDE_WORKSPACE",
            "路径必须是工作区内相对路径",
        ));
    }

    let mut candidate = root.clone();
    for component in relative.components() {
        match component {
            Component::Normal(part) => {
                candidate.push(part);
                validate_existing_segment(&root, &candidate)?;
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(CommandError::new(
                    "PATH_OUTSIDE_WORKSPACE",
                    "路径必须是工作区内相对路径",
                ));
            }
        }
    }

    Ok(candidate)
}

fn validate_existing_segment(root: &Path, candidate: &Path) -> Result<(), CommandError> {
    match fs::symlink_metadata(candidate) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            let target = fs::canonicalize(candidate).map_err(|error| {
                CommandError::new("SYMLINK_ESCAPE", format!("无法解析符号链接：{error}"))
            })?;
            if !target.starts_with(root) {
                return Err(CommandError::new("SYMLINK_ESCAPE", "符号链接指向工作区外"));
            }
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(CommandError::io(format!("无法校验路径：{error}"))),
    }
    Ok(())
}

fn atomic_write(path: &Path, content: &[u8]) -> Result<(), CommandError> {
    atomic_write_with_directory_sync(path, content, sync_parent_directory)
}

fn atomic_write_with_directory_sync<F>(
    path: &Path,
    content: &[u8],
    sync_parent_directory: F,
) -> Result<(), CommandError>
where
    F: FnOnce(&Path) -> std::io::Result<()>,
{
    let parent = path
        .parent()
        .ok_or_else(|| CommandError::new("PATH_OUTSIDE_WORKSPACE", "目标路径没有父目录"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| CommandError::new("IO_ERROR", "目标文件名无效"))?;
    let temporary_path = parent.join(format!(
        ".{file_name}.tau-{}.tmp",
        create_workspace_id(path)
    ));

    let write_result = (|| -> Result<(), CommandError> {
        let mut temporary = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
            .map_err(|error| CommandError::io(format!("无法创建临时文件：{error}")))?;
        temporary
            .write_all(content)
            .map_err(|error| CommandError::io(format!("无法写入临时文件：{error}")))?;
        temporary
            .sync_all()
            .map_err(|error| CommandError::io(format!("无法同步临时文件：{error}")))?;
        replace_existing_file(&temporary_path, path)
            .map_err(|error| CommandError::io(format!("无法原子替换文件：{error}")))?;
        if let Err(error) = sync_parent_directory(parent) {
            log::warn!(
                "文件已通过 rename 提交，但无法同步父目录 {}：{}",
                parent.display(),
                error
            );
        }
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }
    write_result
}

#[cfg(not(windows))]
fn replace_existing_file(temporary_path: &Path, path: &Path) -> std::io::Result<()> {
    fs::rename(temporary_path, path)
}

#[cfg(windows)]
fn replace_existing_file(temporary_path: &Path, path: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let temporary_wide = temporary_path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let target_wide = path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let moved = unsafe {
        MoveFileExW(
            temporary_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        return Err(std::io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) -> std::io::Result<()> {
    File::open(parent).and_then(|directory| directory.sync_all())
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) -> std::io::Result<()> {
    Ok(())
}

fn reject_empty_or_nul(value: &str) -> Result<(), CommandError> {
    if value.is_empty() || value.contains('\0') {
        return Err(CommandError::new(
            "PATH_OUTSIDE_WORKSPACE",
            "路径不能为空且不能包含 NUL 字符",
        ));
    }
    Ok(())
}

fn create_workspace_id(root: &Path) -> String {
    let mut random = [0u8; 16];
    let has_os_randomness = read_os_randomness(&mut random);
    if !has_os_randomness {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        root.hash(&mut hasher);
        NEXT_WORKSPACE_ID
            .fetch_add(1, Ordering::Relaxed)
            .hash(&mut hasher);
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .hash(&mut hasher);
        random[..8].copy_from_slice(&hasher.finish().to_le_bytes());
        random[8..].copy_from_slice(
            &NEXT_WORKSPACE_ID
                .fetch_add(1, Ordering::Relaxed)
                .to_le_bytes(),
        );
    }
    random.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(unix)]
fn read_os_randomness(buffer: &mut [u8]) -> bool {
    File::open("/dev/urandom")
        .and_then(|mut random| random.read_exact(buffer))
        .is_ok()
}

#[cfg(not(unix))]
fn read_os_randomness(_buffer: &mut [u8]) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io;

    use tempfile::TempDir;

    use super::atomic_write_with_directory_sync;

    #[test]
    fn does_not_report_an_error_after_rename_when_directory_sync_is_unsupported() {
        let temp_dir = TempDir::new().expect("temporary workspace");
        let document = temp_dir.path().join("document.txt");
        fs::write(&document, "before").expect("write initial content");

        let result = atomic_write_with_directory_sync(&document, b"after", |_| {
            Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "directory fsync is unsupported",
            ))
        });

        assert!(result.is_ok(), "rename has already committed the write");
        assert_eq!(
            fs::read_to_string(document).expect("read document"),
            "after"
        );
    }
}
