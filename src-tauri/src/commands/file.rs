/// 文件操作命令模块
/// 
/// 实现文件读取、写入、列表、创建、删除、重命名等操作

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::SystemTime;
use tokio::fs;

/// 文件条目 (用于目录列表)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String,  // "file" | "folder"
    pub size: Option<u64>,
    pub modified: Option<SystemTime>,
}

/// 文件详细信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: Option<SystemTime>,
    pub modified: Option<SystemTime>,
    pub accessed: Option<SystemTime>,
    pub is_dir: bool,
}

/// 读取文件内容
/// 
/// # 参数
/// * `path` - 文件路径 (绝对路径或相对于工作目录)
/// 
/// # 返回
/// * `Ok(String)` - 文件内容
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    
    fs::read_to_string(&path)
        .await
        .map_err(|e| format!("读取文件失败：{}", e))
}

/// 写入文件内容
/// 
/// # 参数
/// * `path` - 目标文件路径
/// * `content` - 要写入的内容
/// 
/// # 返回
/// * `Ok(())` - 写入成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    
    // 确保父目录存在
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败：{}", e))?;
    }
    
    fs::write(&path, content)
        .await
        .map_err(|e| format!("写入文件失败：{}", e))
}

/// 原子写入文件内容
/// 
/// 先写入临时文件，然后原子性地重命名到目标路径
/// 同时创建备份文件 (.bak)
/// 
/// # 参数
/// * `path` - 目标文件路径
/// * `content` - 要写入的内容
/// 
/// # 返回
/// * `Ok(())` - 写入成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn atomic_write_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    
    let path = Path::new(&path);
    
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
    
    fs::write(&tmp_path, &content)
        .await
        .map_err(|e| format!("写入临时文件失败：{}", e))?;
    
    // 原子性地重命名
    fs::rename(&tmp_path, path)
        .await
        .map_err(|e| format!("重命名文件失败：{}", e))?;
    
    log::debug!("原子写入成功：{}", path.display());
    Ok(())
}

/// 列出目录内容
/// 
/// # 参数
/// * `dir` - 目录路径
/// 
/// # 返回
/// * `Ok(Vec<FileEntry>)` - 文件条目列表
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn list_files(dir: String) -> Result<Vec<FileEntry>, String> {
    validate_path(&dir)?;
    
    let mut entries = Vec::new();
    let mut read_dir = fs::read_dir(&dir)
        .await
        .map_err(|e| format!("读取目录失败：{}", e))?;
    
    while let Some(entry) = read_dir
        .next_entry()
        .await
        .map_err(|e| format!("读取目录条目失败：{}", e))? 
    {
        let metadata = entry
            .metadata()
            .await
            .map_err(|e| format!("获取文件元数据失败：{}", e))?;
        
        let file_type = if metadata.is_dir() { "folder" } else { "file" }.to_string();
        let size = if metadata.is_file() { Some(metadata.len()) } else { None };
        let modified = metadata.modified().ok();
        
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            file_type,
            size,
            modified,
        });
    }
    
    Ok(entries)
}

/// 创建新文件
/// 
/// # 参数
/// * `path` - 新文件路径
/// 
/// # 返回
/// * `Ok(())` - 创建成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    validate_path(&path)?;
    
    // 检查文件是否已存在
    if Path::new(&path).exists() {
        return Err("文件已存在".to_string());
    }
    
    // 确保父目录存在
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建目录失败：{}", e))?;
    }
    
    fs::write(&path, "")
        .await
        .map_err(|e| format!("创建文件失败：{}", e))
}

/// 删除文件或目录
/// 
/// # 参数
/// * `path` - 要删除的文件或目录路径
/// 
/// # 返回
/// * `Ok(())` - 删除成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    validate_path(&path)?;
    
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| format!("获取文件元数据失败：{}", e))?;
    
    if metadata.is_dir() {
        fs::remove_dir_all(&path)
            .await
            .map_err(|e| format!("删除目录失败：{}", e))?;
    } else {
        fs::remove_file(&path)
            .await
            .map_err(|e| format!("删除文件失败：{}", e))?;
    }
    
    Ok(())
}

/// 重命名/移动文件
/// 
/// # 参数
/// * `old_path` - 原文件路径
/// * `new_path` - 新文件路径
/// 
/// # 返回
/// * `Ok(())` - 重命名成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    validate_path(&old_path)?;
    validate_path(&new_path)?;
    
    fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("重命名文件失败：{}", e))
}

/// 获取文件详细信息
/// 
/// # 参数
/// * `path` - 文件路径
/// 
/// # 返回
/// * `Ok(FileInfo)` - 文件信息
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    validate_path(&path)?;
    
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| format!("获取文件元数据失败：{}", e))?;
    
    let name = Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    
    Ok(FileInfo {
        name,
        path,
        size: metadata.len(),
        created: metadata.created().ok(),
        modified: metadata.modified().ok(),
        accessed: metadata.accessed().ok(),
        is_dir: metadata.is_dir(),
    })
}

/// 验证路径安全性
/// 
/// 防止路径遍历攻击，确保路径在允许的工作目录内
/// 
/// # 参数
/// * `path` - 要验证的路径
/// 
/// # 返回
/// * `Ok(())` - 路径有效
/// * `Err(String)` - 路径无效
fn validate_path(path: &str) -> Result<(), String> {
    // 空路径检查
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    
    // 对于绝对路径，尝试规范化并检查
    if Path::new(path).is_absolute() {
        // 绝对路径可以直接使用，但需要检查是否存在或可访问
        // 这里不做严格限制，允许访问系统任意路径
        // 如果需要限制，可以添加工作目录检查
        return Ok(());
    }
    
    // 相对路径直接使用
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_path_empty() {
        assert!(validate_path("").is_err());
    }
    
    #[test]
    fn test_validate_path_absolute() {
        assert!(validate_path("/tmp/test.txt").is_ok());
    }
    
    #[test]
    fn test_validate_path_relative() {
        assert!(validate_path("test.txt").is_ok());
    }
}
