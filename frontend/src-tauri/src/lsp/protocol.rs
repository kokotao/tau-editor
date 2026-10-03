/**
 * @description LSP JSON-RPC Content-Length framing 编解码与协议辅助函数
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 10:10
 */
use std::io;

use serde_json::Value;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt};

const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_MESSAGE_BYTES: usize = 32 * 1024 * 1024;

/// 将 JSON-RPC 消息编码为 LSP 标准 Content-Length 帧。
pub fn encode_message(message: &Value) -> io::Result<Vec<u8>> {
    let body = serde_json::to_vec(message).map_err(|error| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("无法编码 JSON-RPC 消息：{error}"),
        )
    })?;
    if body.len() > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "JSON-RPC 消息超过 32MiB 限制",
        ));
    }

    let mut frame = format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes();
    frame.extend_from_slice(&body);
    Ok(frame)
}

/// 从语言服务器 stdout 读取一条 Content-Length JSON-RPC 消息。
///
/// LSP 允许在头部携带 Content-Type 等扩展字段，因此这里解析所有头部并只依赖
/// 大小写不敏感的 Content-Length。EOF 且没有任何数据时返回 None，供会话识别进程退出。
pub async fn read_message<R>(reader: &mut R) -> io::Result<Option<Value>>
where
    R: AsyncBufRead + Unpin,
{
    let mut content_length: Option<usize> = None;
    let mut saw_header = false;

    loop {
        let mut line = Vec::new();
        let bytes = reader.read_until(b'\n', &mut line).await?;
        if bytes == 0 {
            if saw_header {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "JSON-RPC 头部未结束",
                ));
            }
            return Ok(None);
        }
        if line.len() > MAX_HEADER_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "JSON-RPC 头部超过 16KiB 限制",
            ));
        }

        let header = std::str::from_utf8(&line).map_err(|error| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("JSON-RPC 头部不是 UTF-8：{error}"),
            )
        })?;
        let trimmed = header.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        saw_header = true;

        let (name, value) = trimmed
            .split_once(':')
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "JSON-RPC 头部缺少冒号"))?;
        if name.trim().eq_ignore_ascii_case("content-length") {
            let length = value.trim().parse::<usize>().map_err(|error| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("JSON-RPC Content-Length 无效：{error}"),
                )
            })?;
            if length > MAX_MESSAGE_BYTES {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "JSON-RPC 消息超过 32MiB 限制",
                ));
            }
            content_length = Some(length);
        }
    }

    let content_length = content_length.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "JSON-RPC 消息缺少 Content-Length",
        )
    })?;
    let mut body = vec![0_u8; content_length];
    reader.read_exact(&mut body).await?;
    serde_json::from_slice(&body).map(Some).map_err(|error| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            format!("JSON-RPC 消息不是合法 JSON：{error}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::{encode_message, read_message};
    use serde_json::json;
    use tokio::io::{AsyncWriteExt, BufReader};

    #[test]
    fn encode_uses_utf8_byte_length() {
        let frame = encode_message(&json!({ "message": "你好" })).unwrap();
        let header_end = frame
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .unwrap();
        let header = String::from_utf8(frame[..header_end].to_vec()).unwrap();
        let body = &frame[header_end + 4..];
        assert_eq!(header, format!("Content-Length: {}", body.len()));
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(body).unwrap()["message"],
            "你好"
        );
    }

    #[tokio::test]
    async fn read_accepts_extra_headers_and_multiple_frames() {
        let first = encode_message(&json!({ "jsonrpc": "2.0", "id": 1, "result": true })).unwrap();
        let second =
            encode_message(&json!({ "jsonrpc": "2.0", "method": "window/logMessage" })).unwrap();
        let (mut writer, reader_stream) = tokio::io::duplex(1024);
        let mut bytes = b"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n".to_vec();
        bytes.extend_from_slice(&first);
        bytes.extend_from_slice(&second);
        writer.write_all(&bytes).await.unwrap();
        drop(writer);

        let mut reader = BufReader::new(reader_stream);
        assert_eq!(read_message(&mut reader).await.unwrap().unwrap()["id"], 1);
        assert_eq!(
            read_message(&mut reader).await.unwrap().unwrap()["method"],
            "window/logMessage"
        );
        assert!(read_message(&mut reader).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn read_rejects_missing_content_length() {
        let stream = tokio::io::duplex(128);
        let (mut writer, reader) = stream;
        writer
            .write_all(b"Content-Type: application/json\r\n\r\n{}")
            .await
            .unwrap();
        drop(writer);
        let mut reader = BufReader::new(reader);
        let error = read_message(&mut reader).await.unwrap_err();
        assert!(error.to_string().contains("Content-Length"));
    }
}
