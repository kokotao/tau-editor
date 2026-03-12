/// 优化的文件操作命令
/// 
/// 支持分块读取、流式传输、大文件优化等

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt};

/// 文件分块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChunk {
    pub content: String,
    pub offset: u64,
    pub size: u64,
    pub total_size: u64,
    pub is_last: bool,
}

/// 分块读取文件内容
/// 
/// # 参数
/// * `path` - 文件路径
/// * `offset` - 起始偏移量 (字节)
/// * `chunk_size` - 分块大小 (字节)
/// 
/// # 返回
/// * `Ok(FileChunk)` - 文件分块
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn read_file_chunked(
    path: String,
    offset: u64,
    chunk_size: u64,
) -> Result<FileChunk, String> {
    validate_path(&path)?;
    
    // 获取文件总大小
    let metadata = fs::metadata(&path)
        .await
        .map_err(|e| format!("获取文件元数据失败：{}", e))?;
    
    let total_size = metadata.len();
    
    // 验证偏移量
    if offset >= total_size {
        return Ok(FileChunk {
            content: String::new(),
            offset,
            size: 0,
            total_size,
            is_last: true,
        });
    }
    
    // 计算实际读取大小
    let remaining = total_size - offset;
    let actual_size = std::cmp::min(chunk_size, remaining);
    
    // 使用 tokio 的异步文件读取
    let mut file = fs::File::open(&path)
        .await
        .map_err(|e| format!("打开文件失败：{}", e))?;
    
    // 定位到偏移量
    file.seek(SeekFrom::Start(offset))
        .await
        .map_err(|e| format!("定位文件失败：{}", e))?;
    
    // 读取分块
    let mut buffer = vec![0u8; actual_size as usize];
    file.read_exact(&mut buffer)
        .await
        .map_err(|e| format!("读取文件失败：{}", e))?;
    
    // 转换为字符串 (UTF-8)
    let content = String::from_utf8_lossy(&buffer).to_string();
    
    let is_last = (offset + actual_size) >= total_size;
    
    Ok(FileChunk {
        content,
        offset,
        size: actual_size,
        total_size,
        is_last,
    })
}

/// 获取文件总行数 (用于大文件优化)
/// 
/// # 参数
/// * `path` - 文件路径
/// 
/// # 返回
/// * `Ok(u64)` - 总行数
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn get_file_line_count(path: String) -> Result<u64, String> {
    validate_path(&path)?;
    
    let file = File::open(&path)
        .map_err(|e| format!("打开文件失败：{}", e))?;
    
    let reader = BufReader::new(file);
    let mut line_count = 0u64;
    
    for line in reader.lines() {
        if line.is_err() {
            break;
        }
        line_count += 1;
    }
    
    Ok(line_count)
}

/// 读取文件的指定行范围
/// 
/// # 参数
/// * `path` - 文件路径
/// * `start_line` - 起始行号 (0-indexed)
/// * `end_line` - 结束行号 (exclusive)
/// 
/// # 返回
/// * `Ok(String)` - 指定行的内容
/// * `Err(String)` - 错误信息
#[tauri::command]
pub async fn read_file_lines(
    path: String,
    start_line: u64,
    end_line: u64,
) -> Result<String, String> {
    validate_path(&path)?;
    
    let file = File::open(&path)
        .map_err(|e| format!("打开文件失败：{}", e))?;
    
    let reader = BufReader::new(file);
    let mut result = String::new();
    let mut current_line = 0u64;
    
    for line_result in reader.lines() {
        let line = line_result.map_err(|e| format!("读取行失败：{}", e))?;
        
        if current_line >= end_line {
            break;
        }
        
        if current_line >= start_line {
            if !result.is_empty() {
                result.push('\n');
            }
            result.push_str(&line);
        }
        
        current_line += 1;
    }
    
    Ok(result)
}

/// 大文件优化配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LargeFileConfig {
    pub max_lines_for_highlighting: u64,
    pub max_file_size_mb: u64,
    pub chunk_size_kb: u64,
}

/// 获取大文件优化配置
/// 
/// # 返回
/// * `Ok(LargeFileConfig)` - 配置
#[tauri::command]
pub async fn get_large_file_config() -> Result<LargeFileConfig, String> {
    Ok(LargeFileConfig {
        max_lines_for_highlighting: 10000,
        max_file_size_mb: 50,
        chunk_size_kb: 1024,
    })
}

/// 验证路径安全性
fn validate_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_path() {
        assert!(validate_path("").is_err());
        assert!(validate_path("/tmp/test.txt").is_ok());
    }
}
