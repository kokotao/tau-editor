/// 优化的文件操作命令
/// 
/// 支持分块读取、流式传输、大文件优化等

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, SeekFrom};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

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
    
    let mut is_last = (offset + actual_size) >= total_size;
    let mut decoded_size = buffer.len();
    if !is_last {
        decoded_size = trim_incomplete_utf8_suffix_len(&buffer);
        // 防止出现 size=0 导致前端 offset 无法推进
        if decoded_size == 0 {
            decoded_size = buffer.len();
        }
        is_last = (offset + decoded_size as u64) >= total_size;
    }

    // 转换为字符串 (UTF-8)，对内部非法字节做 lossy 兜底
    let content = String::from_utf8_lossy(&buffer[..decoded_size]).to_string();
    
    Ok(FileChunk {
        content,
        offset,
        size: decoded_size as u64,
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

/// 分块写入文件（支持追加）
#[tauri::command]
pub async fn write_file_chunked(
    path: String,
    content: String,
    append: bool,
) -> Result<(), String> {
    validate_path(&path)?;

    let mut options = fs::OpenOptions::new();
    options.create(true).write(true);
    if append {
        options.append(true);
    } else {
        options.truncate(true);
    }

    let mut file = options
        .open(&path)
        .await
        .map_err(|e| format!("打开文件失败：{}", e))?;

    file.write_all(content.as_bytes())
        .await
        .map_err(|e| format!("写入文件分块失败：{}", e))?;
    file.flush()
        .await
        .map_err(|e| format!("刷新文件失败：{}", e))?;

    Ok(())
}

/// 验证路径安全性
fn validate_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("路径不能为空".to_string());
    }
    Ok(())
}

/// 计算可安全解码的 UTF-8 前缀长度，避免把多字节字符截断到当前分片尾部。
fn trim_incomplete_utf8_suffix_len(bytes: &[u8]) -> usize {
    if bytes.is_empty() {
        return 0;
    }

    let mut continuation_count = 0usize;
    let mut index = bytes.len();

    while index > 0 && continuation_count < 4 {
        let byte = bytes[index - 1];
        if (byte & 0b1100_0000) == 0b1000_0000 {
            continuation_count += 1;
            index -= 1;
            continue;
        }

        let expected_len = utf8_leading_byte_len(byte);
        if expected_len == 0 {
            return bytes.len();
        }

        let actual_len = continuation_count + 1;
        if actual_len < expected_len {
            return bytes.len().saturating_sub(actual_len);
        }

        return bytes.len();
    }

    // 全是 continuation byte，说明结尾不是完整字符
    if continuation_count > 0 {
        bytes.len().saturating_sub(continuation_count)
    } else {
        bytes.len()
    }
}

fn utf8_leading_byte_len(byte: u8) -> usize {
    if (byte & 0b1000_0000) == 0 {
        1
    } else if (byte & 0b1110_0000) == 0b1100_0000 {
        2
    } else if (byte & 0b1111_0000) == 0b1110_0000 {
        3
    } else if (byte & 0b1111_1000) == 0b1111_0000 {
        4
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_validate_path() {
        assert!(validate_path("").is_err());
        assert!(validate_path("/tmp/test.txt").is_ok());
    }

    #[test]
    fn test_trim_incomplete_utf8_suffix_len_complete_chunk() {
        let content = "hello世界";
        let bytes = content.as_bytes();
        assert_eq!(trim_incomplete_utf8_suffix_len(bytes), bytes.len());
    }

    #[test]
    fn test_trim_incomplete_utf8_suffix_len_incomplete_tail() {
        let bytes = "你好".as_bytes();
        let partial = &bytes[..4];
        assert_eq!(trim_incomplete_utf8_suffix_len(partial), 3);
    }
}
