/// Windows 文件关联配置命令
///
/// 在 Windows 上通过当前用户注册表 (HKCU) 将 Tau Editor 注册为指定
/// 文件类型的默认打开程序，或取消关联，从而让用户可在设置中管理
/// “双击打开”行为。脚本类扩展名 (bat/cmd 等) 默认不关联，避免占用
/// 系统执行能力。

use serde::Serialize;

#[allow(dead_code)]
const PROG_ID_PREFIX: &str = "TauEditor";
#[allow(dead_code)]
const PROG_ID_DISPLAY_PREFIX: &str = "Tau Editor";

// (ext, name, category, executable)
const ASSOCIATION_ITEMS: &[(&str, &str, &str, bool)] = &[
    ("txt", "Text", "text", false),
    ("text", "Text", "text", false),
    ("log", "Log", "text", false),
    ("conf", "Config", "text", false),
    ("cfg", "Config", "text", false),
    ("ini", "Config", "text", false),
    ("md", "Markdown", "markdown", false),
    ("markdown", "Markdown", "markdown", false),
    ("json", "JSON", "json", false),
    ("jsonc", "JSON", "json", false),
    ("yaml", "YAML", "yaml", false),
    ("yml", "YAML", "yaml", false),
    ("toml", "TOML", "toml", false),
    ("js", "JavaScript", "code", false),
    ("jsx", "JavaScript", "code", false),
    ("ts", "TypeScript", "code", false),
    ("tsx", "TypeScript", "code", false),
    ("py", "Python", "code", false),
    ("java", "Java", "code", false),
    ("go", "Go", "code", false),
    ("rs", "Rust", "code", false),
    ("c", "C", "code", false),
    ("cpp", "C++", "code", false),
    ("h", "Header", "code", false),
    ("hpp", "Header", "code", false),
    ("cs", "C#", "code", false),
    ("sql", "SQL", "code", false),
    ("html", "HTML", "code", false),
    ("htm", "HTML", "code", false),
    ("css", "CSS", "code", false),
    ("scss", "SCSS", "code", false),
    ("less", "Less", "code", false),
    ("xml", "XML", "code", false),
    ("sh", "Shell", "script", true),
    ("bash", "Shell", "script", true),
    ("zsh", "Shell", "script", true),
    ("bat", "Batch", "script", true),
    ("cmd", "Command", "script", true),
    ("ps1", "PowerShell", "script", true),
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAssociationState {
    pub ext: String,
    pub name: String,
    pub category: String,
    pub registered: bool,
    pub executable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAssociationsResponse {
    pub supported: bool,
    pub platform: String,
    pub items: Vec<FileAssociationState>,
}

#[allow(dead_code)]
fn normalize_ext(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_start_matches('.').to_ascii_lowercase();
    if trimmed.is_empty() {
        return Err("文件扩展名不能为空".to_string());
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("无效的文件扩展名: {raw}"));
    }
    Ok(trimmed)
}

#[allow(dead_code)]
fn is_supported_ext(ext: &str) -> bool {
    ASSOCIATION_ITEMS.iter().any(|(e, _, _, _)| *e == ext)
}

#[allow(dead_code)]
fn ensure_supported_ext(ext: &str) -> Result<(), String> {
    if is_supported_ext(ext) {
        Ok(())
    } else {
        Err(format!("暂不支持文件扩展名: .{ext}"))
    }
}

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[cfg(target_os = "windows")]
fn ext_classes_key(ext: &str) -> String {
    format!("HKCU\\Software\\Classes\\.{ext}")
}

#[cfg(target_os = "windows")]
fn prog_id(ext: &str) -> String {
    format!("{PROG_ID_PREFIX}.{ext}")
}

#[cfg(target_os = "windows")]
fn current_exe_string() -> Result<String, String> {
    std::env::current_exe()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|error| format!("获取程序路径失败: {error}"))
}

#[cfg(target_os = "windows")]
fn run_reg(args: &[&str]) -> Result<String, String> {
    let output = Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(args)
        .output()
        .map_err(|error| format!("执行 reg.exe 失败: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("reg 命令失败: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(target_os = "windows")]
fn reg_default_value(key: &str) -> Option<String> {
    let output = run_reg(&["query", key, "/ve"]).ok()?;
    output
        .lines()
        .find(|line| line.contains("REG_SZ"))
        .and_then(|line| line.split("REG_SZ").nth(1))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "windows")]
fn is_registered(ext: &str) -> bool {
    let ext_key = ext_classes_key(ext);
    let Some(prog_id) = reg_default_value(&ext_key) else {
        return false;
    };
    let command_key = format!("HKCU\\Software\\Classes\\{prog_id}\\shell\\open\\command");
    let Some(command) = reg_default_value(&command_key) else {
        return false;
    };
    let exe = current_exe_string()
        .unwrap_or_default()
        .replace('/', "\\")
        .to_ascii_lowercase();
    !exe.is_empty() && command.to_ascii_lowercase().contains(&exe)
}

#[cfg(target_os = "windows")]
fn register_ext(ext: &str) -> Result<(), String> {
    let pid = prog_id(ext);
    let pid_key = format!("HKCU\\Software\\Classes\\{pid}");
    let ext_key = ext_classes_key(ext);
    let exe = current_exe_string()?;
    let display = format!("{PROG_ID_DISPLAY_PREFIX} 文档");
    let default_icon_key = format!("{pid_key}\\DefaultIcon");
    let open_command_key = format!("{pid_key}\\shell\\open\\command");
    let default_icon = format!("\"{exe}\",0");
    let open_command = format!("\"{exe}\" \"%1\"");

    run_reg(&["add", pid_key.as_str(), "/ve", "/d", display.as_str(), "/f"])?;
    run_reg(&["add", default_icon_key.as_str(), "/ve", "/d", default_icon.as_str(), "/f"])?;
    run_reg(&["add", open_command_key.as_str(), "/ve", "/d", open_command.as_str(), "/f"])?;
    run_reg(&["add", ext_key.as_str(), "/ve", "/d", pid.as_str(), "/f"])?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn unregister_ext(ext: &str) -> Result<(), String> {
    let pid = prog_id(ext);
    let pid_key = format!("HKCU\\Software\\Classes\\{pid}");
    let ext_key = ext_classes_key(ext);
    let is_ours = is_registered(ext);
    if is_ours {
        let _ = run_reg(&["delete", ext_key.as_str(), "/f"]);
    }
    let _ = run_reg(&["delete", pid_key.as_str(), "/f"]);

    let user_choice_key = format!(
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.{ext}\\UserChoice"
    );
    let _ = run_reg(&["delete", user_choice_key.as_str(), "/f"]);
    Ok(())
}

#[tauri::command]
pub fn get_file_associations() -> FileAssociationsResponse {
    let platform = std::env::consts::OS.to_string();

    #[cfg(target_os = "windows")]
    {
        let items = ASSOCIATION_ITEMS
            .iter()
            .map(|(ext, name, category, executable)| FileAssociationState {
                ext: (*ext).to_string(),
                name: (*name).to_string(),
                category: (*category).to_string(),
                registered: is_registered(ext),
                executable: *executable,
            })
            .collect();
        FileAssociationsResponse {
            supported: true,
            platform,
            items,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let items = ASSOCIATION_ITEMS
            .iter()
            .map(|(ext, name, category, executable)| FileAssociationState {
                ext: (*ext).to_string(),
                name: (*name).to_string(),
                category: (*category).to_string(),
                registered: false,
                executable: *executable,
            })
            .collect();
        FileAssociationsResponse {
            supported: false,
            platform,
            items,
        }
    }
}

#[tauri::command]
pub fn set_file_association(ext: String, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let normalized = normalize_ext(&ext)?;
        ensure_supported_ext(&normalized)?;
        if enabled {
            register_ext(&normalized)
        } else {
            unregister_ext(&normalized)
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (ext, enabled);
        Err("文件关联配置仅支持 Windows 平台".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_ext() {
        assert_eq!(normalize_ext(".BAT").unwrap(), "bat");
        assert_eq!(normalize_ext("cmd").unwrap(), "cmd");
        assert_eq!(normalize_ext("  .Md ").unwrap(), "md");
        assert!(normalize_ext("").is_err());
        assert!(normalize_ext("a b").is_err());
    }

    #[test]
    fn test_supported_ext() {
        assert!(is_supported_ext("bat"));
        assert!(is_supported_ext("cmd"));
        assert!(is_supported_ext("txt"));
        assert!(!is_supported_ext("exe"));
    }
}
