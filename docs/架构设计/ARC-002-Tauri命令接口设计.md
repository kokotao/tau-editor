# ARC-002: Tauri 命令接口设计

## 1. 命令概览

| 命令名 | 描述 | 输入参数 | 返回值 |
|--------|------|----------|--------|
| `read_file` | 读取文件内容 | `path: String` | `Result<String>` |
| `write_file` | 写入文件内容 | `path: String, content: String` | `Result<()>` |
| `list_files` | 列出目录内容 | `dir: String` | `Result<Vec<FileEntry>>` |
| `auto_save_config` | 配置自动保存 | `interval: u64` | `Result<()>` |
| `create_file` | 创建新文件 | `path: String` | `Result<()>` |
| `delete_file` | 删除文件 | `path: String` | `Result<()>` |
| `rename_file` | 重命名文件 | `old_path: String, new_path: String` | `Result<()>` |
| `get_file_info` | 获取文件信息 | `path: String` | `Result<FileInfo>` |

---

## 2. 详细命令定义

### 2.1 read_file

读取指定路径的文件内容。

```rust
#[tauri::command]
async fn read_file(path: String) -> Result<String, String> {
    // 验证路径安全性
    validate_path(&path)?;
    
    // 读取文件
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| e.to_string())
}
```

**参数**:
- `path`: 文件绝对路径或相对于工作目录的路径

**返回**:
- `Ok(String)`: 文件内容
- `Err(String)`: 错误信息 (文件不存在、权限不足等)

**错误类型**:
- `FILE_NOT_FOUND`: 文件不存在
- `PERMISSION_DENIED`: 无读取权限
- `INVALID_PATH`: 路径无效

---

### 2.2 write_file

写入内容到指定文件。

```rust
#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    
    // 确保父目录存在
    if let Some(parent) = Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    
    tokio::fs::write(&path, content)
        .await
        .map_err(|e| e.to_string())
}
```

**参数**:
- `path`: 目标文件路径
- `content`: 要写入的内容

**返回**:
- `Ok(())`: 写入成功
- `Err(String)`: 错误信息

**错误类型**:
- `PERMISSION_DENIED`: 无写入权限
- `DISK_FULL`: 磁盘空间不足
- `INVALID_PATH`: 路径无效

---

### 2.3 list_files

列出指定目录下的文件和子目录。

```rust
#[tauri::command]
async fn list_files(dir: String) -> Result<Vec<FileEntry>, String> {
    validate_path(&dir)?;
    
    let mut entries = Vec::new();
    let mut read_dir = tokio::fs::read_dir(&dir).await?;
    
    while let Some(entry) = read_dir.next_entry().await? {
        let metadata = entry.metadata().await?;
        entries.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            file_type: if metadata.is_dir() { "folder" } else { "file" }.to_string(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
            modified: metadata.modified().ok(),
        });
    }
    
    Ok(entries)
}
```

**参数**:
- `dir`: 目录路径

**返回**:
- `Ok(Vec<FileEntry>)`: 文件条目列表
- `Err(String)`: 错误信息

---

### 2.4 auto_save_config

配置自动保存功能。

```rust
#[tauri::command]
fn auto_save_config(interval: u64) -> Result<(), String> {
    // interval: 自动保存间隔 (秒)
    // 0 = 禁用自动保存
    // 最小值: 5 秒
    
    if interval != 0 && interval < 5 {
        return Err("自动保存间隔最小为 5 秒".to_string());
    }
    
    // 更新配置
    CONFIG.lock().auto_save_interval = interval;
    
    // 重启自动保存定时器
    restart_auto_save_timer();
    
    Ok(())
}
```

**参数**:
- `interval`: 自动保存间隔 (秒)，0 表示禁用

**返回**:
- `Ok(())`: 配置成功
- `Err(String)`: 错误信息

---

### 2.5 create_file

创建新文件。

```rust
#[tauri::command]
async fn create_file(path: String) -> Result<(), String> {
    validate_path(&path)?;
    
    // 检查文件是否已存在
    if Path::new(&path).exists() {
        return Err("文件已存在".to_string());
    }
    
    tokio::fs::write(&path, "")
        .await
        .map_err(|e| e.to_string())
}
```

---

### 2.6 delete_file

删除文件。

```rust
#[tauri::command]
async fn delete_file(path: String) -> Result<(), String> {
    validate_path(&path)?;
    
    let metadata = tokio::fs::metadata(&path).await?;
    
    if metadata.is_dir() {
        tokio::fs::remove_dir_all(&path).await?;
    } else {
        tokio::fs::remove_file(&path).await?;
    }
    
    Ok(())
}
```

---

### 2.7 rename_file

重命名/移动文件。

```rust
#[tauri::command]
async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    validate_path(&old_path)?;
    validate_path(&new_path)?;
    
    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| e.to_string())
}
```

---

### 2.8 get_file_info

获取文件详细信息。

```rust
#[tauri::command]
async fn get_file_info(path: String) -> Result<FileInfo, String> {
    validate_path(&path)?;
    
    let metadata = tokio::fs::metadata(&path).await?;
    
    Ok(FileInfo {
        name: Path::new(&path).file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
        path,
        size: metadata.len(),
        created: metadata.created().ok(),
        modified: metadata.modified().ok(),
        accessed: metadata.accessed().ok(),
        is_dir: metadata.is_dir(),
    })
}
```

---

## 3. 数据结构定义

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String,  // "file" | "folder"
    pub size: Option<u64>,
    pub modified: Option<std::time::SystemTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub created: Option<std::time::SystemTime>,
    pub modified: Option<std::time::SystemTime>,
    pub accessed: Option<std::time::SystemTime>,
    pub is_dir: bool,
}
```

---

## 4. 路径安全验证

```rust
fn validate_path(path: &str) -> Result<(), String> {
    // 防止路径遍历攻击
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|_| "无效路径")?;
    
    // 确保路径在允许的工作目录内
    let workdir = get_workdir();
    if !canonical.starts_with(&workdir) {
        return Err("路径超出工作目录范围".to_string());
    }
    
    Ok(())
}
```

---

## 5. 前端调用示例

```typescript
// 使用 @tauri-apps/api/core 的 invoke

import { invoke } from '@tauri-apps/api/core';

// 读取文件
const content = await invoke<string>('read_file', { 
  path: '/path/to/file.txt' 
});

// 写入文件
await invoke('write_file', { 
  path: '/path/to/file.txt', 
  content: 'Hello World' 
});

// 列出目录
const entries = await invoke<FileEntry[]>('list_files', { 
  dir: '/path/to/dir' 
});

// 配置自动保存
await invoke('auto_save_config', { 
  interval: 30  // 30 秒
});
```

---

*文档版本: 1.0*
*创建时间: 2026-03-11*
