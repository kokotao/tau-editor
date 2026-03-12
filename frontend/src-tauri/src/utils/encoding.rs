/// 编码检测工具模块
/// 
/// 使用 chardetng 和 encoding_rs 进行文件编码检测和转换

use encoding_rs::{Encoding, UTF_8, GBK, GB18030, BIG5, SHIFT_JIS, EUC_KR, WINDOWS_1252};
use std::path::Path;
use tokio::fs;

/// 编码检测结果
#[derive(Debug, Clone)]
pub struct EncodingResult {
    /// 检测到的编码名称
    pub encoding_name: String,
    /// 编码置信度 (0.0 - 1.0)
    pub confidence: f32,
    /// 解码后的内容
    pub content: String,
}

/// 检测文件编码并读取内容
/// 
/// # 参数
/// * `path` - 文件路径
/// 
/// # 返回
/// * `Ok(EncodingResult)` - 编码检测结果
/// * `Err(String)` - 错误信息
pub async fn detect_and_read(path: &Path) -> Result<EncodingResult, String> {
    // 读取原始字节
    let bytes = fs::read(path)
        .await
        .map_err(|e| format!("读取文件失败：{}", e))?;
    
    // 检测编码
    let (encoding, confidence) = detect_encoding(&bytes);
    
    // 解码内容
    let (content, _, has_errors) = encoding.decode(&bytes);
    
    if has_errors {
        // 如果有解码错误，尝试回退到 UTF-8
        log::warn!("文件 {} 解码时出现错误，尝试使用 UTF-8", path.display());
        let (utf8_content, _, _) = UTF_8.decode(&bytes);
        return Ok(EncodingResult {
            encoding_name: "UTF-8 (fallback)".to_string(),
            confidence: 0.0,
            content: utf8_content.to_string(),
        });
    }
    
    Ok(EncodingResult {
        encoding_name: encoding.name().to_string(),
        confidence,
        content: content.to_string(),
    })
}

/// 检测字节流的编码
/// 
/// # 参数
/// * `bytes` - 原始字节
/// 
/// # 返回
/// * `(Encoding, f32)` - 编码和置信度
pub fn detect_encoding(bytes: &[u8]) -> (&'static Encoding, f32) {
    // 使用 chardetng 检测编码
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    
    // 获取检测到的编码
    let detected = detector.guess(None, true);
    
    // 映射到 encoding_rs 的编码
    let encoding = match detected.name() {
        "UTF-8" => UTF_8,
        "GBK" | "GB2312" => GBK,
        "GB18030" => GB18030,
        "Big5" => BIG5,
        "Shift_JIS" => SHIFT_JIS,
        "EUC-KR" => EUC_KR,
        "Windows-1252" | "ISO-8859-1" => WINDOWS_1252,
        _ => UTF_8, // 默认回退到 UTF-8
    };
    
    // 计算置信度
    let confidence = calculate_confidence(bytes, encoding);
    
    (encoding, confidence)
}

/// 计算编码置信度
/// 
/// # 参数
/// * `bytes` - 原始字节
/// * `encoding` - 编码
/// 
/// # 返回
/// * `f32` - 置信度 (0.0 - 1.0)
fn calculate_confidence(bytes: &[u8], encoding: &'static Encoding) -> f32 {
    // 简单的置信度计算：检查解码是否成功且无错误
    let (_, _, has_errors) = encoding.decode(bytes);
    
    if has_errors {
        0.3
    } else {
        // 如果没有错误，根据编码类型给出不同的置信度
        match encoding.name() {
            "UTF-8" => {
                // 检查是否有 BOM
                if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
                    1.0
                } else {
                    0.9
                }
            }
            "GBK" | "GB18030" => 0.85,
            "Big5" => 0.85,
            "Shift_JIS" => 0.85,
            "EUC-KR" => 0.85,
            _ => 0.7,
        }
    }
}

/// 使用指定编码写入文件
/// 
/// # 参数
/// * `path` - 文件路径
/// * `content` - 内容
/// * `encoding_name` - 编码名称 (如 "UTF-8", "GBK")
/// 
/// # 返回
/// * `Ok(())` - 写入成功
/// * `Err(String)` - 错误信息
pub async fn write_with_encoding(
    path: &Path,
    content: &str,
    encoding_name: &str,
) -> Result<(), String> {
    let encoding = get_encoding_by_name(encoding_name)
        .ok_or_else(|| format!("不支持的编码：{}", encoding_name))?;
    
    let (bytes, _, _) = encoding.encode(content);
    let bytes: &[u8] = bytes.as_ref();

    fs::write(path, bytes)
        .await
        .map_err(|e| format!("写入文件失败：{}", e))
}

/// 根据名称获取编码
/// 
/// # 参数
/// * `name` - 编码名称
/// 
/// # 返回
/// * `Option<&'static Encoding>` - 编码
pub fn get_encoding_by_name(name: &str) -> Option<&'static Encoding> {
    match name.to_uppercase().as_str() {
        "UTF-8" | "UTF8" => Some(UTF_8),
        "GBK" | "GB2312" => Some(GBK),
        "GB18030" => Some(GB18030),
        "BIG5" | "BIG-5" => Some(BIG5),
        "SHIFT_JIS" | "SJIS" => Some(SHIFT_JIS),
        "EUC_KR" | "EUCKR" => Some(EUC_KR),
        "WINDOWS-1252" | "CP1252" => Some(WINDOWS_1252),
        _ => Encoding::for_label(name.as_bytes()),
    }
}

/// 获取支持的编码列表
/// 
/// # 返回
/// * `Vec<&'static str>` - 编码名称列表
pub fn get_supported_encodings() -> Vec<&'static str> {
    vec![
        "UTF-8",
        "GBK",
        "GB18030",
        "BIG5",
        "SHIFT_JIS",
        "EUC_KR",
        "WINDOWS-1252",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_encoding_utf8() {
        let bytes = b"Hello, World!";
        let (encoding, confidence) = detect_encoding(bytes);
        assert_eq!(encoding.name(), "UTF-8");
        assert!(confidence > 0.5);
    }
    
    #[test]
    fn test_get_encoding_by_name() {
        assert_eq!(get_encoding_by_name("UTF-8").unwrap().name(), "UTF-8");
        assert_eq!(get_encoding_by_name("GBK").unwrap().name(), "GBK");
        assert!(get_encoding_by_name("INVALID").is_none());
    }
    
    #[test]
    fn test_get_supported_encodings() {
        let encodings = get_supported_encodings();
        assert!(encodings.contains(&"UTF-8"));
        assert!(encodings.contains(&"GBK"));
    }
}
