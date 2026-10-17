/**
 * @description 将前端生成的 PNG 字节写入操作系统原生图片剪贴板
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-16 16:35
 */
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::fs::{self, OpenOptions};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::io::Write;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::process::Command;
#[cfg(any(target_os = "macos", target_os = "windows"))]
use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::CommandError;

const MAX_CLIPBOARD_IMAGE_BYTES: usize = 50 * 1024 * 1024;
const MAX_CLIPBOARD_IMAGE_PIXELS: u64 = 20_000_000;

/// 将 PNG 图片写入系统原生剪贴板。
///
/// macOS 的 WebView 对异步 `ClipboardItem` 和 SVG 图片类型兼容性不一致，
/// 因此桌面端把 PNG 交给系统的 AppleScript 剪贴板接口，保证其他应用读取到
/// 真正的图片格式，而不是只在当前 WebView 内部显示“复制成功”。
#[tauri::command]
pub async fn write_clipboard_image(bytes: Vec<u8>) -> Result<(), CommandError> {
    tokio::task::spawn_blocking(move || write_clipboard_image_blocking(bytes))
        .await
        .map_err(|error| {
            CommandError::new(
                "CLIPBOARD_WRITE_FAILED",
                format!("图片剪贴板任务异常结束：{error}"),
            )
        })?
}

fn write_clipboard_image_blocking(bytes: Vec<u8>) -> Result<(), CommandError> {
    validate_png(&bytes)?;
    #[cfg(target_os = "macos")]
    {
        let file = TemporaryPng::create(&bytes)?;
        return write_png_to_macos_clipboard(file.path());
    }

    #[cfg(target_os = "windows")]
    {
        let file = TemporaryPng::create(&bytes)?;
        return write_png_to_windows_clipboard(file.path());
    }

    #[cfg(target_os = "linux")]
    {
        return write_png_to_linux_clipboard(&bytes);
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        let _ = bytes;
        Err(CommandError::new(
            "CLIPBOARD_UNAVAILABLE",
            "当前平台暂不支持原生图片剪贴板",
        ))
    }
}

fn validate_png(bytes: &[u8]) -> Result<(), CommandError> {
    if bytes.is_empty() || bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err(CommandError::new(
            "CLIPBOARD_IMAGE_INVALID",
            "PNG 图片为空或超过 50 MiB",
        ));
    }
    let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
        .read_info()
        .map_err(|error| {
            CommandError::new(
                "CLIPBOARD_IMAGE_INVALID",
                format!("无法读取 PNG 图片：{error}"),
            )
        })?;
    let info = reader.info();
    if info.width == 0
        || info.height == 0
        || u64::from(info.width) * u64::from(info.height) > MAX_CLIPBOARD_IMAGE_PIXELS
    {
        return Err(CommandError::new(
            "CLIPBOARD_IMAGE_INVALID",
            "PNG 图片尺寸无效或超过 2000 万像素",
        ));
    }
    let mut decoded = vec![0; reader.output_buffer_size()];
    reader.next_frame(&mut decoded).map_err(|error| {
        CommandError::new(
            "CLIPBOARD_IMAGE_INVALID",
            format!("PNG 图片数据损坏：{error}"),
        )
    })?;
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
struct TemporaryPng {
    path: std::path::PathBuf,
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl TemporaryPng {
    fn create(bytes: &[u8]) -> Result<Self, CommandError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let path = std::env::temp_dir().join(format!(
            "tau-editor-clipboard-{}-{timestamp}.png",
            std::process::id()
        ));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(|error| {
            CommandError::new(
                "CLIPBOARD_WRITE_FAILED",
                format!("无法创建临时图片：{error}"),
            )
        })?;
        file.write_all(bytes).map_err(|error| {
            CommandError::new(
                "CLIPBOARD_WRITE_FAILED",
                format!("无法写入临时图片：{error}"),
            )
        })?;
        file.flush().map_err(|error| {
            CommandError::new(
                "CLIPBOARD_WRITE_FAILED",
                format!("无法刷新临时图片：{error}"),
            )
        })?;
        Ok(Self { path })
    }

    fn path(&self) -> &std::path::Path {
        &self.path
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
impl Drop for TemporaryPng {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

#[cfg(target_os = "macos")]
fn write_png_to_macos_clipboard(path: &std::path::Path) -> Result<(), CommandError> {
    let script = r#"
on run argv
    set imageFile to POSIX file (item 1 of argv) as alias
    set the clipboard to (read imageFile as «class PNGf»)
end run
"#;
    let output = Command::new("osascript")
        .args(["-e", script, "--"])
        .arg(path)
        .output()
        .map_err(|error| {
            CommandError::new(
                "CLIPBOARD_UNAVAILABLE",
                format!("无法调用 macOS 剪贴板：{error}"),
            )
        })?;
    command_result(output, "macOS")
}

#[cfg(target_os = "windows")]
fn write_png_to_windows_clipboard(path: &std::path::Path) -> Result<(), CommandError> {
    let script = r#"Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $image = [System.Drawing.Image]::FromFile($env:TAU_EDITOR_CLIPBOARD_IMAGE_PATH); try { [System.Windows.Forms.Clipboard]::SetImage($image) } finally { $image.Dispose() }"#;
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-STA", "-Command", script])
        .env("TAU_EDITOR_CLIPBOARD_IMAGE_PATH", path)
        .output()
        .map_err(|error| {
            CommandError::new(
                "CLIPBOARD_UNAVAILABLE",
                format!("无法调用 Windows 剪贴板：{error}"),
            )
        })?;
    command_result(output, "Windows")
}

#[cfg(target_os = "linux")]
fn write_png_to_linux_clipboard(bytes: &[u8]) -> Result<(), CommandError> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut wl_copy = match Command::new("wl-copy")
        .args(["--type", "image/png"])
        .stdin(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => Some(child),
        Err(_) => None,
    };
    if let Some(mut child) = wl_copy.take() {
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(bytes).map_err(|error| {
                CommandError::new(
                    "CLIPBOARD_WRITE_FAILED",
                    format!("无法传输 PNG 图片：{error}"),
                )
            })?;
        }
        let output = child.wait_with_output().map_err(|error| {
            CommandError::new(
                "CLIPBOARD_WRITE_FAILED",
                format!("wl-copy 执行失败：{error}"),
            )
        })?;
        if output.status.success() {
            return Ok(());
        }
    }

    let mut child = match Command::new("xclip")
        .args(["-selection", "clipboard", "-t", "image/png", "-i"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child,
        Err(_) => {
            return Err(CommandError::new(
                "CLIPBOARD_UNAVAILABLE",
                "未找到可用的 Linux 图片剪贴板工具（wl-copy 或 xclip）",
            ));
        }
    };
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(bytes).map_err(|error| {
            CommandError::new(
                "CLIPBOARD_WRITE_FAILED",
                format!("无法传输 PNG 图片：{error}"),
            )
        })?;
    }
    let status = child.wait().map_err(|error| {
        CommandError::new(
            "CLIPBOARD_WRITE_FAILED",
            format!("无法等待 xclip 完成：{error}"),
        )
    })?;
    if status.success() {
        Ok(())
    } else {
        Err(CommandError::new(
            "CLIPBOARD_WRITE_FAILED",
            "xclip 写入图片剪贴板失败",
        ))
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn command_result(output: std::process::Output, platform: &str) -> Result<(), CommandError> {
    if output.status.success() {
        return Ok(());
    }
    let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(CommandError::new(
        "CLIPBOARD_WRITE_FAILED",
        if message.is_empty() {
            format!("{platform} 拒绝写入图片剪贴板")
        } else {
            format!("{platform} 拒绝写入图片剪贴板：{message}")
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::validate_png;

    #[test]
    fn accepts_valid_png() {
        let mut output = std::io::Cursor::new(Vec::new());
        {
            let mut encoder = png::Encoder::new(&mut output, 1, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().expect("PNG header should encode");
            writer
                .write_image_data(&[10, 20, 30, 255])
                .expect("PNG pixel should encode");
        }
        let bytes = output.into_inner();

        assert!(validate_png(&bytes).is_ok());
    }

    #[test]
    fn rejects_non_png_content() {
        let error = validate_png(b"not an image").expect_err("non-PNG must be rejected");

        assert_eq!(error.code, "CLIPBOARD_IMAGE_INVALID");
    }

    #[test]
    fn rejects_png_with_corrupted_payload() {
        let mut output = std::io::Cursor::new(Vec::new());
        {
            let mut encoder = png::Encoder::new(&mut output, 1, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().expect("PNG header should encode");
            writer
                .write_image_data(&[10, 20, 30, 255])
                .expect("PNG pixel should encode");
        }
        let mut bytes = output.into_inner();
        let payload_index = bytes
            .windows(4)
            .position(|chunk_type| chunk_type == b"IDAT")
            .expect("PNG data chunk should exist")
            + 4;
        bytes[payload_index] ^= 0xff;
        let error = validate_png(&bytes).expect_err("corrupt PNG data must be rejected");

        assert_eq!(error.code, "CLIPBOARD_IMAGE_INVALID");
    }
}
