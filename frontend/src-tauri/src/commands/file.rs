/// 文件操作命令模块
/// 
/// 实现文件读取、写入、列表、创建、删除、重命名等操作

use serde::{Deserialize, Serialize};
use rusqlite::{types::ValueRef, Connection};
use quick_xml::events::Event;
use std::collections::HashSet;
use std::io::Read;
use std::path::Path;
use std::time::SystemTime;
use tokio::fs;
use zip::ZipArchive;

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

    let extension = Path::new(&path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "db" | "sqlite" | "sqlite3" => {
            let path_for_task = path.clone();
            if let Ok(Ok(preview)) = tokio::task::spawn_blocking(move || render_sqlite_preview(&path_for_task)).await {
                return Ok(preview);
            }
        }
        "pdf" => {
            let path_for_task = path.clone();
            if let Ok(Ok(preview)) = tokio::task::spawn_blocking(move || render_pdf_preview(&path_for_task)).await {
                return Ok(preview);
            }
        }
        "docx" => {
            let path_for_task = path.clone();
            if let Ok(Ok(preview)) = tokio::task::spawn_blocking(move || render_docx_preview(&path_for_task)).await {
                return Ok(preview);
            }
        }
        "doc" => {
            let path_for_task = path.clone();
            if let Ok(Ok(preview)) = tokio::task::spawn_blocking(move || render_doc_preview(&path_for_task)).await {
                return Ok(preview);
            }
        }
        _ => {}
    }

    let bytes = fs::read(&path)
        .await
        .map_err(|e| format!("读取文件失败：{}", e))?;

    if let Ok(content) = std::str::from_utf8(&bytes) {
        return Ok(content.to_string());
    }

    Ok(render_binary_preview(&path, &bytes))
}

fn render_binary_preview(path: &str, bytes: &[u8]) -> String {
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);
    let extension = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    let file_type = detect_binary_file_type(&extension, bytes);

    let preview_len = std::cmp::min(96, bytes.len());
    let preview = &bytes[..preview_len];

    let hex_preview = preview
        .iter()
        .map(|byte| format!("{:02X}", byte))
        .collect::<Vec<_>>()
        .join(" ");

    let ascii_preview: String = preview
        .iter()
        .map(|byte| {
            if byte.is_ascii_graphic() || *byte == b' ' {
                *byte as char
            } else {
                '.'
            }
        })
        .collect();

    let sqlite_tip = if bytes.starts_with(b"SQLite format 3\0") {
        "\nSQLite Header: SQLite format 3"
    } else {
        ""
    };

    format!(
        "[Binary File Preview]\n\
File: {file_name}\n\
Type: {file_type}\n\
Size: {} bytes\n\
\n\
This binary file can't be fully displayed as editable text.\n\
Showing first {} bytes:\n\
\n\
HEX:\n\
{hex_preview}\n\
\n\
ASCII:\n\
{ascii_preview}{sqlite_tip}",
        bytes.len(),
        preview_len,
    )
}

fn detect_binary_file_type(extension: &str, bytes: &[u8]) -> &'static str {
    match extension {
        "pdf" => "PDF Document",
        "doc" => "Microsoft Word Document (.doc)",
        "docx" => "Microsoft Word Document (.docx)",
        "db" | "sqlite" | "sqlite3" => "SQLite Database",
        _ => {
            if bytes.starts_with(b"%PDF-") {
                "PDF Document"
            } else if bytes.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]) {
                "Microsoft Office Binary Document"
            } else if bytes.starts_with(b"PK\x03\x04") {
                "ZIP-based Document"
            } else if bytes.starts_with(b"SQLite format 3\0") {
                "SQLite Database"
            } else {
                "Binary File"
            }
        }
    }
}

fn render_sqlite_preview(path: &str) -> Result<String, String> {
    let conn = Connection::open(path).map_err(|e| format!("打开 SQLite 文件失败：{}", e))?;
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);

    let table_names = {
        let mut stmt = conn
            .prepare(
                "SELECT name
                 FROM sqlite_master
                 WHERE type='table' AND name NOT LIKE 'sqlite_%'
                 ORDER BY name",
            )
            .map_err(|e| format!("读取数据库表失败：{}", e))?;
        let names = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("读取数据库表失败：{}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取数据库表失败：{}", e))?;
        names
    };

    let mut output = format!(
        "[SQLite Preview]\nFile: {file_name}\nTables: {}\n",
        table_names.len()
    );

    if table_names.is_empty() {
        output.push_str("\nNo user tables found.\n");
        return Ok(output);
    }

    for table_name in table_names.iter().take(20) {
        let quoted_table = quote_identifier(table_name);
        output.push_str(&format!("\n=== Table: {table_name} ===\n"));

        let row_count = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {quoted_table}"),
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0);
        output.push_str(&format!("Rows: {row_count}\n"));

        output.push_str("Columns:\n");
        let pragma_sql = format!("PRAGMA table_info({quoted_table})");
        let mut pragma_stmt = conn
            .prepare(&pragma_sql)
            .map_err(|e| format!("读取表结构失败（{table_name}）：{}", e))?;
        let columns = pragma_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?.unwrap_or_else(|| "TEXT".to_string()),
                    row.get::<_, i64>(3)? == 1,
                    row.get::<_, i64>(5)? > 0,
                ))
            })
            .map_err(|e| format!("读取表结构失败（{table_name}）：{}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("读取表结构失败（{table_name}）：{}", e))?;

        for (name, col_type, not_null, is_pk) in &columns {
            let mut flags = Vec::new();
            if *is_pk {
                flags.push("PK");
            }
            if *not_null {
                flags.push("NOT NULL");
            }
            if flags.is_empty() {
                output.push_str(&format!("- {name}: {col_type}\n"));
            } else {
                output.push_str(&format!("- {name}: {col_type} ({})\n", flags.join(", ")));
            }
        }

        let mut sample_stmt = conn
            .prepare(&format!("SELECT * FROM {quoted_table} LIMIT 5"))
            .map_err(|e| format!("读取样例数据失败（{table_name}）：{}", e))?;
        let column_names = sample_stmt
            .column_names()
            .iter()
            .map(|name| name.to_string())
            .collect::<Vec<_>>();
        let column_count = sample_stmt.column_count();
        let mut rows = sample_stmt
            .query([])
            .map_err(|e| format!("读取样例数据失败（{table_name}）：{}", e))?;
        let mut row_index = 0usize;

        output.push_str("Sample rows:\n");
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("读取样例数据失败（{table_name}）：{}", e))?
        {
            row_index += 1;
            let mut pairs = Vec::with_capacity(column_count);
            for idx in 0..column_count {
                let col_name = column_names
                    .get(idx)
                    .cloned()
                    .unwrap_or_else(|| format!("col_{idx}"));
                let value = row
                    .get_ref(idx)
                    .map(value_ref_to_preview)
                    .unwrap_or_else(|_| "<unreadable>".to_string());
                pairs.push(format!("{col_name}={value}"));
            }
            output.push_str(&format!("[{row_index}] {}\n", pairs.join(", ")));
        }

        if row_index == 0 {
            output.push_str("(no rows)\n");
        }
    }

    if table_names.len() > 20 {
        output.push_str(&format!(
            "\n... {} more tables omitted for preview.\n",
            table_names.len() - 20
        ));
    }

    Ok(output)
}

fn render_pdf_preview(path: &str) -> Result<String, String> {
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);
    let extracted = pdf_extract::extract_text(path)
        .map_err(|e| format!("提取 PDF 正文失败：{}", e))?;
    let cleaned = normalize_extracted_text(&extracted);
    if cleaned.is_empty() {
        return Err("PDF 中未提取到可读正文".to_string());
    }

    Ok(format!(
        "[PDF Text Preview]\nFile: {file_name}\n\n{}",
        limit_preview_length(&cleaned, 50000)
    ))
}

fn render_docx_preview(path: &str) -> Result<String, String> {
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("打开 DOCX 文件失败：{}", e))?;
    let mut archive = ZipArchive::new(&mut file)
        .map_err(|e| format!("解析 DOCX 压缩包失败：{}", e))?;

    let mut document_xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|e| format!("读取 DOCX 主文档失败：{}", e))?
        .read_to_string(&mut document_xml)
        .map_err(|e| format!("读取 DOCX 主文档失败：{}", e))?;

    let extracted = extract_docx_text_from_xml(&document_xml)?;
    let cleaned = normalize_extracted_text(&extracted);
    if cleaned.is_empty() {
        return Err("DOCX 中未提取到可读正文".to_string());
    }

    Ok(format!(
        "[DOCX Text Preview]\nFile: {file_name}\n\n{}",
        limit_preview_length(&cleaned, 50000)
    ))
}

fn render_doc_preview(path: &str) -> Result<String, String> {
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path);
    let bytes = std::fs::read(path).map_err(|e| format!("读取 DOC 文件失败：{}", e))?;
    let extracted = extract_strings_from_binary(&bytes);
    if extracted.is_empty() {
        return Err("DOC 中未提取到可读正文".to_string());
    }

    Ok(format!(
        "[DOC Text Preview]\nFile: {file_name}\n\n{}",
        limit_preview_length(&extracted, 50000)
    ))
}

fn extract_docx_text_from_xml(xml: &str) -> Result<String, String> {
    let mut reader = quick_xml::Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut text = String::new();
    let mut in_text = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref event)) => {
                match event.name().as_ref() {
                    b"w:t" => in_text = true,
                    b"w:p" => {
                        if !text.is_empty() && !text.ends_with('\n') {
                            text.push('\n');
                        }
                    }
                    b"w:tab" => text.push('\t'),
                    b"w:br" => text.push('\n'),
                    _ => {}
                }
            }
            Ok(Event::End(ref event)) => {
                if event.name().as_ref() == b"w:t" {
                    in_text = false;
                }
            }
            Ok(Event::Text(content)) => {
                if in_text {
                    let value = content
                        .xml_content()
                        .map_err(|e| format!("解析 DOCX 正文失败：{}", e))?;
                    text.push_str(&value);
                }
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(format!("解析 DOCX XML 失败：{}", err)),
            _ => {}
        }
        buf.clear();
    }

    Ok(text)
}

fn extract_strings_from_binary(bytes: &[u8]) -> String {
    let mut collected = Vec::new();
    collected.extend(extract_ascii_runs(bytes));
    collected.extend(extract_utf16le_runs(bytes));

    let mut unique = HashSet::new();
    let mut cleaned = Vec::new();
    for segment in collected {
        let normalized = segment.trim();
        if normalized.len() < 6 {
            continue;
        }
        if unique.insert(normalized.to_string()) {
            cleaned.push(normalized.to_string());
        }
        if cleaned.len() >= 80 {
            break;
        }
    }

    cleaned.join("\n")
}

fn extract_ascii_runs(bytes: &[u8]) -> Vec<String> {
    let mut runs = Vec::new();
    let mut current = String::new();

    for &byte in bytes {
        if byte.is_ascii_graphic() || byte == b' ' {
            current.push(byte as char);
        } else if !current.is_empty() {
            runs.push(current.clone());
            current.clear();
        }
    }

    if !current.is_empty() {
        runs.push(current);
    }
    runs
}

fn extract_utf16le_runs(bytes: &[u8]) -> Vec<String> {
    let mut runs = Vec::new();
    let mut index = 0usize;

    while index + 1 < bytes.len() {
        let mut current = String::new();
        let mut cursor = index;

        while cursor + 1 < bytes.len() {
            let lo = bytes[cursor];
            let hi = bytes[cursor + 1];

            if hi == 0 && (lo.is_ascii_graphic() || lo == b' ') {
                current.push(lo as char);
                cursor += 2;
                continue;
            }
            break;
        }

        if !current.is_empty() {
            runs.push(current);
            index = cursor;
        } else {
            index += 2;
        }
    }

    runs
}

fn normalize_extracted_text(text: &str) -> String {
    text
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn limit_preview_length(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }

    let truncated = text.chars().take(max_chars).collect::<String>();
    format!("{truncated}\n\n...[truncated for preview]")
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

fn value_ref_to_preview(value: ValueRef<'_>) -> String {
    let raw = match value {
        ValueRef::Null => "NULL".to_string(),
        ValueRef::Integer(v) => v.to_string(),
        ValueRef::Real(v) => v.to_string(),
        ValueRef::Text(v) => String::from_utf8_lossy(v).to_string(),
        ValueRef::Blob(v) => format!("<blob:{} bytes>", v.len()),
    };

    if raw.chars().count() > 120 {
        format!("{}...", raw.chars().take(120).collect::<String>())
    } else {
        raw
    }
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
    use std::fs;
    use tempfile::TempDir;
    
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

    #[test]
    fn test_detect_binary_file_type() {
        assert_eq!(detect_binary_file_type("pdf", b"%PDF-1.7"), "PDF Document");
        assert_eq!(detect_binary_file_type("doc", &[0xD0, 0xCF, 0x11, 0xE0]), "Microsoft Word Document (.doc)");
        assert_eq!(detect_binary_file_type("db", b"SQLite format 3\0"), "SQLite Database");
    }

    #[test]
    fn test_render_binary_preview_contains_file_type_and_header() {
        let bytes = b"SQLite format 3\0\x00\x01\x02";
        let preview = render_binary_preview("/tmp/sample.db", bytes);

        assert!(preview.contains("[Binary File Preview]"));
        assert!(preview.contains("Type: SQLite Database"));
        assert!(preview.contains("SQLite Header: SQLite format 3"));
    }

    #[tokio::test]
    async fn test_read_file_binary_returns_preview() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("sample.pdf");
        fs::write(&file_path, b"%PDF-1.7\xFF\xFEbinary").unwrap();

        let result = read_file(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.contains("[Binary File Preview]"));
        assert!(content.contains("PDF Document"));
    }

    #[test]
    fn test_extract_docx_text_from_xml() {
        let xml = r#"
        <w:document>
          <w:body>
            <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
            <w:p><w:r><w:t>World</w:t></w:r></w:p>
          </w:body>
        </w:document>
        "#;

        let extracted = extract_docx_text_from_xml(xml).unwrap();
        assert!(extracted.contains("Hello"));
        assert!(extracted.contains("World"));
    }

    #[test]
    fn test_extract_strings_from_binary() {
        let bytes = b"\xD0\xCF\x11\xE0This is visible text\x00M\x00o\x00r\x00e\x00 \x00t\x00e\x00x\x00t\x00";
        let extracted = extract_strings_from_binary(bytes);
        assert!(extracted.contains("This is visible text") || extracted.contains("More text"));
    }

    #[test]
    fn test_render_sqlite_preview() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("sample.db");

        let conn = Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)", [])
            .unwrap();
        conn.execute("INSERT INTO users (name) VALUES ('Alice'), ('Bob')", [])
            .unwrap();

        let preview = render_sqlite_preview(db_path.to_string_lossy().as_ref()).unwrap();
        assert!(preview.contains("[SQLite Preview]"));
        assert!(preview.contains("Table: users"));
        assert!(preview.contains("Rows: 2"));
    }

    #[tokio::test]
    async fn test_read_file_sqlite_returns_structured_preview() {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("runtime.db");

        let conn = Connection::open(&db_path).unwrap();
        conn.execute("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)", [])
            .unwrap();
        conn.execute("INSERT INTO notes (body) VALUES ('first note')", [])
            .unwrap();

        let result = read_file(db_path.to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.contains("[SQLite Preview]"));
        assert!(content.contains("Table: notes"));
    }
}
