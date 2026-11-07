/**
 * @description 根据会员等级切换跨平台窗口图标及 macOS Dock 应用图标。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-11-07 21:46
 */
use tauri::AppHandle;
#[cfg(not(target_os = "macos"))]
use tauri::Manager;

const DEFAULT_ICON: &[u8] = include_bytes!("../../icons/icon.png");
const MEMBER_ICON: &[u8] = include_bytes!("../../icons/premium/icon.png");

fn is_member_tier(tier: &str) -> bool {
    matches!(tier.trim().to_ascii_uppercase().as_str(), "PLUS" | "PRO")
}

#[tauri::command]
pub fn set_app_icon(app: AppHandle, tier: String) -> Result<(), String> {
    let icon_bytes = if is_member_tier(&tier) {
        MEMBER_ICON
    } else {
        DEFAULT_ICON
    };

    #[cfg(target_os = "macos")]
    {
        set_macos_dock_icon(&app, icon_bytes)
    }

    #[cfg(not(target_os = "macos"))]
    {
        set_window_icons(&app, icon_bytes)
    }
}

#[cfg(not(target_os = "macos"))]
fn set_window_icons(app: &AppHandle, icon_bytes: &[u8]) -> Result<(), String> {
    let icon = tauri::image::Image::from_bytes(icon_bytes)
        .map_err(|error| format!("应用图标解码失败：{error}"))?;
    let mut errors = Vec::new();

    for (label, window) in app.webview_windows() {
        if let Err(error) = window.set_icon(icon.clone()) {
            errors.push(format!("{label}: {error}"));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("更新窗口图标失败：{}", errors.join("; ")))
    }
}

#[cfg(target_os = "macos")]
fn set_macos_dock_icon(app: &AppHandle, icon_bytes: &'static [u8]) -> Result<(), String> {
    app.run_on_main_thread(move || {
        use objc2::{AllocAnyThread, MainThreadMarker};
        use objc2_app_kit::{NSApplication, NSImage};
        use objc2_foundation::NSData;

        let Some(main_thread) = MainThreadMarker::new() else {
            log::error!("无法在主线程更新 macOS Dock 图标");
            return;
        };

        let application = NSApplication::sharedApplication(main_thread);
        let data = NSData::with_bytes(icon_bytes);
        if let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) {
            unsafe { application.setApplicationIconImage(Some(&icon)) };
        } else {
            log::error!("无法从 PNG 数据创建 macOS Dock 图标");
        }
    })
    .map_err(|error| format!("调度 macOS Dock 图标更新失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::is_member_tier;

    #[test]
    fn only_plus_and_pro_use_the_gold_icon() {
        assert!(is_member_tier("PLUS"));
        assert!(is_member_tier("pro"));
        assert!(!is_member_tier("FREE"));
        assert!(!is_member_tier(""));
    }
}
