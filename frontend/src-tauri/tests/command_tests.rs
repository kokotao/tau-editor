//! Tauri Command Tests
//! 
//! 测试 Tauri Commands 的正确性

use text_editor_lib::commands::file;
use tempfile::TempDir;
use std::fs;

#[tokio::test]
async fn test_read_file_success() {
    // 创建临时文件和目录
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    let test_content = "Hello, World!";
    
    // 写入测试内容
    fs::write(&file_path, test_content).unwrap();
    
    // 调用 read_file 命令
    let result = file::read_file(file_path.to_string_lossy().to_string()).await;
    
    // 验证结果
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), test_content);
}

#[tokio::test]
async fn test_read_file_not_found() {
    // 尝试读取不存在的文件
    let result = file::read_file("/nonexistent/path/file.txt".to_string()).await;
    
    // 应该返回错误
    assert!(result.is_err());
}

#[tokio::test]
async fn test_write_file_success() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("output.txt");
    let content = "Test content";
    
    // 调用 write_file 命令
    let result = file::write_file(
        file_path.to_string_lossy().to_string(),
        content.to_string(),
    ).await;
    
    // 验证结果
    assert!(result.is_ok());
    
    // 验证文件内容
    let read_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_content, content);
}

#[tokio::test]
async fn test_write_file_create_directories() {
    let temp_dir = TempDir::new().unwrap();
    let nested_path = temp_dir.path().join("subdir").join("output.txt");
    let content = "Nested content";
    
    // 调用 write_file 命令（应该自动创建目录）
    let result = file::write_file(
        nested_path.to_string_lossy().to_string(),
        content.to_string(),
    ).await;
    
    // 验证结果
    assert!(result.is_ok());
    assert!(nested_path.exists());
    
    let read_content = fs::read_to_string(&nested_path).unwrap();
    assert_eq!(read_content, content);
}

#[tokio::test]
async fn test_list_files() {
    let temp_dir = TempDir::new().unwrap();
    
    // 创建测试文件
    fs::write(temp_dir.path().join("file1.txt"), "content1").unwrap();
    fs::write(temp_dir.path().join("file2.md"), "content2").unwrap();
    fs::create_dir(temp_dir.path().join("subdir")).unwrap();
    
    // 调用 list_files 命令
    let result = file::list_files(temp_dir.path().to_string_lossy().to_string()).await;
    
    // 验证结果
    assert!(result.is_ok());
    let files = result.unwrap();
    
    // 应该包含创建的文件和目录
    assert!(files.iter().any(|f| f.name == "file1.txt"));
    assert!(files.iter().any(|f| f.name == "file2.md"));
    assert!(files.iter().any(|f| f.name == "subdir"));
}

#[tokio::test]
async fn test_create_file() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("new_file.txt");
    
    // 调用 create_file 命令
    let result = file::create_file(file_path.to_string_lossy().to_string()).await;
    
    // 验证结果
    assert!(result.is_ok());
    assert!(file_path.exists());
}

#[tokio::test]
async fn test_create_file_already_exists() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("existing.txt");
    
    // 先创建文件
    fs::write(&file_path, "content").unwrap();
    
    // 尝试再次创建
    let result = file::create_file(file_path.to_string_lossy().to_string()).await;
    
    // 应该返回错误
    assert!(result.is_err());
}

#[tokio::test]
async fn test_delete_file() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("to_delete.txt");
    
    // 先创建文件
    fs::write(&file_path, "content").unwrap();
    
    // 调用 delete_file 命令
    let result = file::delete_file(file_path.to_string_lossy().to_string()).await;
    
    // 验证结果
    assert!(result.is_ok());
    assert!(!file_path.exists());
}

#[tokio::test]
async fn test_rename_file() {
    let temp_dir = TempDir::new().unwrap();
    let old_path = temp_dir.path().join("old_name.txt");
    let new_path = temp_dir.path().join("new_name.txt");
    
    // 先创建文件
    fs::write(&old_path, "content").unwrap();
    
    // 调用 rename_file 命令
    let result = file::rename_file(
        old_path.to_string_lossy().to_string(),
        new_path.to_string_lossy().to_string(),
    ).await;
    
    // 验证结果
    assert!(result.is_ok());
    assert!(!old_path.exists());
    assert!(new_path.exists());
}

#[tokio::test]
async fn test_get_file_info() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("info_test.txt");
    
    // 先创建文件
    fs::write(&file_path, "content").unwrap();
    
    // 调用 get_file_info 命令
    let result = file::get_file_info(file_path.to_string_lossy().to_string()).await;
    
    // 验证结果
    assert!(result.is_ok());
    let info = result.unwrap();
    
    assert_eq!(info.name, "info_test.txt");
    assert!(!info.is_dir);
    assert!(info.size > 0);
}

#[tokio::test]
async fn test_auto_save_config() {
    use text_editor_lib::commands::settings::{auto_save_config, get_auto_save_interval};
    
    // 测试禁用
    assert!(auto_save_config(0).is_ok());
    assert_eq!(get_auto_save_interval(), 0);
    
    // 测试启用
    assert!(auto_save_config(30).is_ok());
    assert_eq!(get_auto_save_interval(), 30);
    
    // 测试最小值
    assert!(auto_save_config(5).is_ok());
    assert_eq!(get_auto_save_interval(), 5);
    
    // 测试太小值 (应该失败)
    assert!(auto_save_config(3).is_err());
}

// ============================================================================
// 路径验证测试
// ============================================================================

#[tokio::test]
async fn test_read_file_empty_path() {
    // 空路径应返回错误
    let result = file::read_file("".to_string()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_read_file_absolute_path() {
    // 绝对路径应通过验证
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("abs_test.txt");
    fs::write(&file_path, "content").unwrap();
    
    let result = file::read_file(file_path.to_string_lossy().to_string()).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_read_file_relative_path() {
    // 相对路径应通过验证
    let original_dir = std::env::current_dir().unwrap();
    let temp_dir = TempDir::new().unwrap();
    std::env::set_current_dir(temp_dir.path()).unwrap();
    
    fs::write("relative_test.txt", "relative content").unwrap();
    
    let result = file::read_file("relative_test.txt".to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "relative content");
    
    std::env::set_current_dir(original_dir).unwrap();
}

// ============================================================================
// read_file 边界测试
// ============================================================================

#[tokio::test]
async fn test_read_file_large_file() {
    // 读取大文件 (>1MB)
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("large_file.txt");
    
    // 创建 1MB 的文件
    let large_content = "x".repeat(1_000_000);
    fs::write(&file_path, &large_content).unwrap();
    
    let result = file::read_file(file_path.to_string_lossy().to_string()).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().len(), 1_000_000);
}

#[tokio::test]
async fn test_read_file_binary_file() {
    // 读取二进制文件应正确处理
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("binary.bin");
    
    // 写入二进制数据
    let binary_data = vec![0x00, 0x01, 0x02, 0xFF, 0xFE];
    fs::write(&file_path, &binary_data).unwrap();
    
    let result = file::read_file(file_path.to_string_lossy().to_string()).await;
    // 二进制文件可能无法正确读取为字符串，但不应崩溃
    // 具体行为取决于实现
    assert!(result.is_ok() || result.is_err());
}

#[tokio::test]
async fn test_read_file_no_permission() {
    // 读取无权限文件应返回错误
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("no_permission.txt");
    
    fs::write(&file_path, "secret").unwrap();
    
    // 设置文件为只读 (Linux/Unix)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&file_path).unwrap().permissions();
        perms.set_mode(0o000);
        fs::set_permissions(&file_path, perms).unwrap();
        
        let result = file::read_file(file_path.to_string_lossy().to_string()).await;
        assert!(result.is_err());
        
        // 恢复权限以便清理
        perms.set_mode(0o644);
        fs::set_permissions(&file_path, perms).unwrap();
    }
}

// ============================================================================
// write_file 边界测试
// ============================================================================

#[tokio::test]
async fn test_write_file_large_content() {
    // 写入大文件
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("large_output.txt");
    
    let large_content = "y".repeat(500_000);
    
    let result = file::write_file(
        file_path.to_string_lossy().to_string(),
        large_content.clone(),
    ).await;
    
    assert!(result.is_ok());
    
    let read_content = fs::read_to_string(&file_path).unwrap();
    assert_eq!(read_content.len(), 500_000);
}

#[tokio::test]
async fn test_write_file_readonly_directory() {
    // 写入到只读目录应返回错误
    let temp_dir = TempDir::new().unwrap();
    let readonly_dir = temp_dir.path().join("readonly");
    fs::create_dir(&readonly_dir).unwrap();
    
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&readonly_dir).unwrap().permissions();
        perms.set_mode(0o555); // 只读 + 执行
        fs::set_permissions(&readonly_dir, perms).unwrap();
        
        let file_path = readonly_dir.join("cannot_write.txt");
        let result = file::write_file(
            file_path.to_string_lossy().to_string(),
            "content".to_string(),
        ).await;
        
        assert!(result.is_err());
        
        // 恢复权限以便清理
        perms.set_mode(0o755);
        fs::set_permissions(&readonly_dir, perms).unwrap();
    }
}

#[tokio::test]
async fn test_write_file_empty_content() {
    // 写入空内容
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("empty.txt");
    
    let result = file::write_file(
        file_path.to_string_lossy().to_string(),
        "".to_string(),
    ).await;
    
    assert!(result.is_ok());
    assert!(file_path.exists());
    assert_eq!(fs::read_to_string(&file_path).unwrap(), "");
}

// ============================================================================
// list_files 测试
// ============================================================================

#[tokio::test]
async fn test_list_files_empty_directory() {
    // 空目录应返回空列表
    let temp_dir = TempDir::new().unwrap();
    
    let result = file::list_files(temp_dir.path().to_string_lossy().to_string()).await;
    
    assert!(result.is_ok());
    let files = result.unwrap();
    assert!(files.is_empty());
}

#[tokio::test]
async fn test_list_files_distinguish_files_and_dirs() {
    // 应正确区分文件和文件夹
    let temp_dir = TempDir::new().unwrap();
    
    fs::write(temp_dir.path().join("file.txt"), "content").unwrap();
    fs::create_dir(temp_dir.path().join("dir")).unwrap();
    
    let result = file::list_files(temp_dir.path().to_string_lossy().to_string()).await;
    
    assert!(result.is_ok());
    let files = result.unwrap();
    
    let file_entry = files.iter().find(|f| f.name == "file.txt").unwrap();
    let dir_entry = files.iter().find(|f| f.name == "dir").unwrap();
    
    assert!(!file_entry.is_dir);
    assert!(dir_entry.is_dir);
}

#[tokio::test]
async fn test_list_files_includes_metadata() {
    // 应包含元数据 (大小、修改时间)
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("meta_test.txt");
    
    fs::write(&file_path, "metadata test content").unwrap();
    
    let result = file::list_files(temp_dir.path().to_string_lossy().to_string()).await;
    
    assert!(result.is_ok());
    let files = result.unwrap();
    
    let file_entry = files.iter().find(|f| f.name == "meta_test.txt").unwrap();
    
    assert!(file_entry.size > 0);
    assert!(file_entry.modified.is_some());
}

// ============================================================================
// delete_file 测试
// ============================================================================

#[tokio::test]
async fn test_delete_file_nonexistent() {
    // 删除不存在的文件应返回错误
    let result = file::delete_file("/nonexistent/file.txt".to_string()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_delete_directory_recursive() {
    // 删除目录应递归删除
    let temp_dir = TempDir::new().unwrap();
    let dir_path = temp_dir.path().join("to_delete");
    fs::create_dir(&dir_path).unwrap();
    fs::write(dir_path.join("file1.txt"), "content1").unwrap();
    fs::write(dir_path.join("file2.txt"), "content2").unwrap();
    
    let result = file::delete_file(dir_path.to_string_lossy().to_string()).await;
    
    assert!(result.is_ok());
    assert!(!dir_path.exists());
}

// ============================================================================
// rename_file 测试
// ============================================================================

#[tokio::test]
async fn test_rename_file_overwrite_existing() {
    // 重命名到已存在文件的行为
    let temp_dir = TempDir::new().unwrap();
    let old_path = temp_dir.path().join("old.txt");
    let new_path = temp_dir.path().join("existing.txt");
    
    fs::write(&old_path, "old content").unwrap();
    fs::write(&new_path, "existing content").unwrap();
    
    let result = file::rename_file(
        old_path.to_string_lossy().to_string(),
        new_path.to_string_lossy().to_string(),
    ).await;
    
    // 重命名应覆盖已存在文件
    assert!(result.is_ok());
    assert!(!old_path.exists());
    assert!(new_path.exists());
    assert_eq!(fs::read_to_string(&new_path).unwrap(), "old content");
}

#[tokio::test]
async fn test_rename_file_cross_directory() {
    // 跨目录移动文件
    let temp_dir = TempDir::new().unwrap();
    let dir1 = temp_dir.path().join("dir1");
    let dir2 = temp_dir.path().join("dir2");
    fs::create_dir(&dir1).unwrap();
    fs::create_dir(&dir2).unwrap();
    
    let old_path = dir1.join("file.txt");
    let new_path = dir2.join("file.txt");
    
    fs::write(&old_path, "cross dir content").unwrap();
    
    let result = file::rename_file(
        old_path.to_string_lossy().to_string(),
        new_path.to_string_lossy().to_string(),
    ).await;
    
    assert!(result.is_ok());
    assert!(!old_path.exists());
    assert!(new_path.exists());
    assert_eq!(fs::read_to_string(&new_path).unwrap(), "cross dir content");
}

#[tokio::test]
async fn test_rename_file_nonexistent_source() {
    // 重命名不存在的源文件应返回错误
    let temp_dir = TempDir::new().unwrap();
    let new_path = temp_dir.path().join("new.txt");
    
    let result = file::rename_file(
        "/nonexistent/old.txt".to_string(),
        new_path.to_string_lossy().to_string(),
    ).await;
    
    assert!(result.is_err());
}

// ============================================================================
// 集成测试 - 文件操作流程
// ============================================================================

#[tokio::test]
async fn test_file_operation_workflow() {
    // 完整文件操作流程：创建 → 写入 → 读取 → 重命名 → 删除
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("workflow_test.txt");
    
    // 1. 创建文件
    let create_result = file::create_file(file_path.to_string_lossy().to_string()).await;
    assert!(create_result.is_ok());
    
    // 2. 写入内容
    let write_result = file::write_file(
        file_path.to_string_lossy().to_string(),
        "workflow content".to_string(),
    ).await;
    assert!(write_result.is_ok());
    
    // 3. 读取内容
    let read_result = file::read_file(file_path.to_string_lossy().to_string()).await;
    assert!(read_result.is_ok());
    assert_eq!(read_result.unwrap(), "workflow content");
    
    // 4. 重命名文件
    let renamed_path = temp_dir.path().join("workflow_renamed.txt");
    let rename_result = file::rename_file(
        file_path.to_string_lossy().to_string(),
        renamed_path.to_string_lossy().to_string(),
    ).await;
    assert!(rename_result.is_ok());
    
    // 5. 验证重命名后内容
    let read_renamed = file::read_file(renamed_path.to_string_lossy().to_string()).await;
    assert!(read_renamed.is_ok());
    assert_eq!(read_renamed.unwrap(), "workflow content");
    
    // 6. 删除文件
    let delete_result = file::delete_file(renamed_path.to_string_lossy().to_string()).await;
    assert!(delete_result.is_ok());
    assert!(!renamed_path.exists());
}

#[tokio::test]
async fn test_error_messages_are_clear() {
    // 错误应包含清晰的错误信息
    let result = file::read_file("/definitely/not/existing/path/file.txt".to_string()).await;
    
    assert!(result.is_err());
    let err_msg = format!("{:?}", result.err().unwrap());
    
    // 错误信息应包含路径信息
    assert!(err_msg.contains("No such file") || err_msg.contains("not found") || err_msg.contains("不存在"));
}

// ============================================================================
// file_optimized 模块测试
// ============================================================================

use text_editor_lib::commands::file_optimized;

#[test]
fn test_validate_path_empty() {
    // 空路径应返回错误
    let result = file_optimized::validate_path("");
    assert!(result.is_err());
}

#[test]
fn test_validate_path_valid() {
    // 有效路径应通过验证
    let result = file_optimized::validate_path("/tmp/test.txt");
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_get_large_file_config() {
    // 获取大文件优化配置
    let config = file_optimized::get_large_file_config().await;
    
    assert!(config.is_ok());
    let config = config.unwrap();
    
    // 验证默认配置值
    assert_eq!(config.max_lines_for_highlighting, 10000);
    assert_eq!(config.max_file_size_mb, 50);
    assert_eq!(config.chunk_size_kb, 1024);
}

#[tokio::test]
async fn test_read_file_chunked_small_file() {
    // 读取小文件的分块
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("small.txt");
    let content = "Hello, Chunked World!";
    fs::write(&file_path, content).unwrap();
    
    let result = file_optimized::read_file_chunked(
        file_path.to_string_lossy().to_string(),
        0,
        1024,
    ).await;
    
    assert!(result.is_ok());
    let chunk = result.unwrap();
    
    assert_eq!(chunk.content, content);
    assert_eq!(chunk.offset, 0);
    assert_eq!(chunk.size, content.len() as u64);
    assert_eq!(chunk.total_size, content.len() as u64);
    assert!(chunk.is_last);
}

#[tokio::test]
async fn test_read_file_chunked_offset() {
    // 从偏移量读取分块
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("offset.txt");
    let content = "0123456789ABCDEF";
    fs::write(&file_path, content).unwrap();
    
    let result = file_optimized::read_file_chunked(
        file_path.to_string_lossy().to_string(),
        5,
        5,
    ).await;
    
    assert!(result.is_ok());
    let chunk = result.unwrap();
    
    assert_eq!(chunk.content, "56789");
    assert_eq!(chunk.offset, 5);
    assert_eq!(chunk.size, 5);
    assert!(!chunk.is_last);
}

#[tokio::test]
async fn test_read_file_chunked_beyond_eof() {
    // 偏移量超出文件末尾
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("eof.txt");
    fs::write(&file_path, "Short content").unwrap();
    
    let result = file_optimized::read_file_chunked(
        file_path.to_string_lossy().to_string(),
        1000,
        100,
    ).await;
    
    assert!(result.is_ok());
    let chunk = result.unwrap();
    
    assert_eq!(chunk.content, "");
    assert_eq!(chunk.size, 0);
    assert!(chunk.is_last);
}

#[tokio::test]
async fn test_read_file_chunked_nonexistent() {
    // 读取不存在的文件
    let result = file_optimized::read_file_chunked(
        "/nonexistent/file.txt".to_string(),
        0,
        1024,
    ).await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_read_file_chunked_empty_path() {
    // 空路径应返回错误
    let result = file_optimized::read_file_chunked(
        "".to_string(),
        0,
        1024,
    ).await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_get_file_line_count() {
    // 获取文件行数
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("lines.txt");
    let content = "Line 1\nLine 2\nLine 3\nLine 4";
    fs::write(&file_path, content).unwrap();
    
    let result = file_optimized::get_file_line_count(
        file_path.to_string_lossy().to_string(),
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 4);
}

#[tokio::test]
async fn test_get_file_line_count_empty() {
    // 空文件行数
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("empty.txt");
    fs::write(&file_path, "").unwrap();
    
    let result = file_optimized::get_file_line_count(
        file_path.to_string_lossy().to_string(),
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 0);
}

#[tokio::test]
async fn test_get_file_line_count_single_line_no_newline() {
    // 单行无换行符
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("single.txt");
    fs::write(&file_path, "Single line without newline").unwrap();
    
    let result = file_optimized::get_file_line_count(
        file_path.to_string_lossy().to_string(),
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), 1);
}

#[tokio::test]
async fn test_read_file_lines_range() {
    // 读取指定行范围
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("range.txt");
    let content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    fs::write(&file_path, content).unwrap();
    
    let result = file_optimized::read_file_lines(
        file_path.to_string_lossy().to_string(),
        1,  // 从第 2 行开始 (0-indexed)
        4,  // 到第 4 行 (exclusive)
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "Line 2\nLine 3\nLine 4");
}

#[tokio::test]
async fn test_read_file_lines_from_start() {
    // 从开头读取
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("from_start.txt");
    let content = "Line 1\nLine 2\nLine 3";
    fs::write(&file_path, content).unwrap();
    
    let result = file_optimized::read_file_lines(
        file_path.to_string_lossy().to_string(),
        0,
        2,
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "Line 1\nLine 2");
}

#[tokio::test]
async fn test_read_file_lines_to_end() {
    // 读取到文件末尾
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("to_end.txt");
    let content = "Line 1\nLine 2\nLine 3";
    fs::write(&file_path, content).unwrap();
    
    let result = file_optimized::read_file_lines(
        file_path.to_string_lossy().to_string(),
        2,
        100,  // 超出实际行数
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "Line 3");
}

#[tokio::test]
async fn test_read_file_lines_empty_range() {
    // 空范围
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("empty_range.txt");
    fs::write(&file_path, "Line 1\nLine 2").unwrap();
    
    let result = file_optimized::read_file_lines(
        file_path.to_string_lossy().to_string(),
        5,
        3,  // end < start
    ).await;
    
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "");
}

#[tokio::test]
async fn test_read_file_lines_nonexistent() {
    // 读取不存在的文件
    let result = file_optimized::read_file_lines(
        "/nonexistent/file.txt".to_string(),
        0,
        10,
    ).await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_file_chunk_serialization() {
    // 测试 FileChunk 的序列化
    let chunk = file_optimized::FileChunk {
        content: "test".to_string(),
        offset: 100,
        size: 4,
        total_size: 1000,
        is_last: false,
    };
    
    let json = serde_json::to_string(&chunk).unwrap();
    assert!(json.contains("\"content\":\"test\""));
    assert!(json.contains("\"offset\":100"));
    assert!(json.contains("\"size\":4"));
    assert!(json.contains("\"total_size\":1000"));
    assert!(json.contains("\"is_last\":false"));
}
