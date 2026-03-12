/// 路径处理工具模块
/// 
/// 提供路径规范化、验证、安全处理等功能

use std::path::{Path, PathBuf};

/// 规范化路径
/// 
/// 将路径转换为规范形式，解析 `.` 和 `..`
/// 
/// # 参数
/// * `path` - 输入路径
/// 
/// # 返回
/// * `PathBuf` - 规范化后的路径
pub fn normalize_path<P: AsRef<Path>>(path: P) -> PathBuf {
    let path = path.as_ref();
    
    // 如果路径存在，使用 canonicalize
    if path.exists() {
        if let Ok(canonical) = path.canonicalize() {
            return canonical;
        }
    }
    
    // 否则手动规范化
    normalize_path_manual(path)
}

/// 手动规范化路径 (不要求路径存在)
/// 
/// # 参数
/// * `path` - 输入路径
/// 
/// # 返回
/// * `PathBuf` - 规范化后的路径
fn normalize_path_manual(path: &Path) -> PathBuf {
    let mut result = PathBuf::new();

    for component in path.components() {
        match component {
            std::path::Component::Prefix(prefix) => result.push(prefix.as_os_str()),
            std::path::Component::RootDir => {
                result.push(component.as_os_str());
            }
            std::path::Component::CurDir => {
                continue;
            }
            std::path::Component::ParentDir => {
                result.pop();
            }
            std::path::Component::Normal(part) => {
                result.push(part);
            }
        }
    }

    if result.as_os_str().is_empty() {
        PathBuf::from(".")
    } else {
        result
    }
}

/// 验证路径是否安全
/// 
/// 检查路径是否包含路径遍历攻击
/// 
/// # 参数
/// * `path` - 要验证的路径
/// 
/// # 返回
/// * `bool` - 是否安全
pub fn is_path_safe<P: AsRef<Path>>(path: P) -> bool {
    let path = path.as_ref();
    
    // 检查路径字符串中是否包含明显的遍历模式
    let path_str = path.to_string_lossy();
    
    // 不允许连续的 ..
    if path_str.contains("..\\..") || path_str.contains("../..") {
        return false;
    }
    
    // 不允许以 .. 开头 (相对路径遍历)
    if path_str.starts_with("..") {
        return false;
    }
    
    true
}

/// 获取路径的父目录
/// 
/// # 参数
/// * `path` - 文件路径
/// 
/// # 返回
/// * `Option<PathBuf>` - 父目录路径
pub fn get_parent_dir<P: AsRef<Path>>(path: P) -> Option<PathBuf> {
    path.as_ref().parent().map(|p| p.to_path_buf())
}

/// 获取文件扩展名
/// 
/// # 参数
/// * `path` - 文件路径
/// 
/// # 返回
/// * `Option<String>` - 文件扩展名 (不含点)
pub fn get_extension<P: AsRef<Path>>(path: P) -> Option<String> {
    path.as_ref()
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_string)
}

/// 获取文件名 (不含扩展名)
/// 
/// # 参数
/// * `path` - 文件路径
/// 
/// # 返回
/// * `Option<String>` - 文件名
pub fn get_file_stem<P: AsRef<Path>>(path: P) -> Option<String> {
    path.as_ref()
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(str::to_string)
}

/// 构建路径
/// 
/// # 参数
/// * `base` - 基础路径
/// * `parts` - 路径组件
/// 
/// # 返回
/// * `PathBuf` - 构建的路径
pub fn join_path<P: AsRef<Path>>(base: P, parts: &[&str]) -> PathBuf {
    let mut result = base.as_ref().to_path_buf();
    for part in parts {
        result.push(part);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_path_current() {
        let path = normalize_path("./test.txt");
        assert!(path.ends_with("test.txt"));
    }
    
    #[test]
    fn test_is_path_safe_valid() {
        assert!(is_path_safe("/home/user/file.txt"));
        assert!(is_path_safe("file.txt"));
    }
    
    #[test]
    fn test_is_path_safe_invalid() {
        assert!(!is_path_safe("../../etc/passwd"));
        assert!(!is_path_safe("../.."));
    }
    
    #[test]
    fn test_get_extension() {
        assert_eq!(get_extension("test.txt"), Some("txt".to_string()));
        assert_eq!(get_extension("test"), None);
    }
    
    #[test]
    fn test_get_file_stem() {
        assert_eq!(get_file_stem("test.txt"), Some("test".to_string()));
        assert_eq!(get_file_stem("test"), Some("test".to_string()));
    }
}
