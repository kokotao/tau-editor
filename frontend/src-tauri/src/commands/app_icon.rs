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
    let icon = decode_icon(icon_bytes)?;
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

#[cfg(any(not(target_os = "macos"), test))]
fn decode_icon(icon_bytes: &[u8]) -> Result<tauri::image::Image<'static>, String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(icon_bytes));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder
        .read_info()
        .map_err(|error| format!("应用图标解码失败：{error}"))?;
    let mut decoded = vec![0; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut decoded)
        .map_err(|error| format!("应用图标解码失败：{error}"))?;
    let pixels = &decoded[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => pixels.to_vec(),
        png::ColorType::Rgb => pixels
            .chunks_exact(3)
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
            .collect(),
        png::ColorType::Grayscale => pixels
            .iter()
            .flat_map(|pixel| [*pixel, *pixel, *pixel, 255])
            .collect(),
        png::ColorType::GrayscaleAlpha => pixels
            .chunks_exact(2)
            .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
            .collect(),
        png::ColorType::Indexed => {
            return Err("应用图标解码失败：PNG 调色板未展开".to_string());
        }
    };

    Ok(tauri::image::Image::new_owned(
        rgba,
        info.width,
        info.height,
    ))
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
    use super::{decode_icon, is_member_tier};

    fn encode_png(color_type: png::ColorType, pixels: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 2, 1);
            encoder.set_color(color_type);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(pixels).unwrap();
        }
        bytes
    }

    #[test]
    fn only_plus_and_pro_use_the_gold_icon() {
        assert!(is_member_tier("PLUS"));
        assert!(is_member_tier("pro"));
        assert!(!is_member_tier("FREE"));
        assert!(!is_member_tier(""));
    }

    #[test]
    fn decodes_rgb_and_grayscale_pngs_to_rgba() {
        let rgb = decode_icon(&encode_png(png::ColorType::Rgb, &[10, 20, 30, 40, 50, 60])).unwrap();
        assert_eq!(rgb.width(), 2);
        assert_eq!(rgb.height(), 1);
        assert_eq!(rgb.rgba(), &[10, 20, 30, 255, 40, 50, 60, 255]);

        let grayscale = decode_icon(&encode_png(png::ColorType::Grayscale, &[70, 80])).unwrap();
        assert_eq!(grayscale.rgba(), &[70, 70, 70, 255, 80, 80, 80, 255]);
    }

    #[test]
    fn preserves_alpha_for_rgba_and_grayscale_alpha_pngs() {
        let rgba = decode_icon(&encode_png(
            png::ColorType::Rgba,
            &[10, 20, 30, 40, 50, 60, 70, 80],
        ))
        .unwrap();
        assert_eq!(rgba.rgba(), &[10, 20, 30, 40, 50, 60, 70, 80]);

        let grayscale_alpha = decode_icon(&encode_png(
            png::ColorType::GrayscaleAlpha,
            &[90, 100, 110, 120],
        ))
        .unwrap();
        assert_eq!(
            grayscale_alpha.rgba(),
            &[90, 90, 90, 100, 110, 110, 110, 120]
        );
    }

    #[test]
    fn rejects_invalid_png_data() {
        assert!(decode_icon(b"not a png").is_err());
    }
}
