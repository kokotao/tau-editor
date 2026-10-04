/**
 * @description 应用私有语言服务器下载、校验、安装与状态管理
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 16:20
 */
use std::collections::BTreeMap;
use std::error::Error as StdError;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use flate2::read::GzDecoder;
use reqwest::Url;
use sha2::{Digest, Sha256};
use tokio::task;

use crate::models::{
    CommandError, LspArchiveFormat, LspInstallRequest, LspProvisionStatus,
    LspProvisionStatusResponse,
};

const ROOT_DIR: &str = "lsp-servers";
const MANIFEST_FILE: &str = "manifest.json";
const DOWNLOAD_MAX_ATTEMPTS: usize = 4;
const DOWNLOAD_CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    #[serde(default)]
    servers: BTreeMap<String, ManifestEntry>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    version: String,
    install_dir: String,
    executable_path: String,
    #[serde(default)]
    launch_command: Option<String>,
    #[serde(default)]
    launch_args: Vec<String>,
    #[serde(default)]
    launch_env: BTreeMap<String, String>,
    sha256: String,
    size_bytes: u64,
}

/// 应用私有语言服务器安装器。
#[derive(Debug, Clone)]
pub struct LspProvisioner {
    root: PathBuf,
}

impl LspProvisioner {
    /// 从 Tauri app_data_dir 创建安装器。
    pub fn new(app_data_dir: impl Into<PathBuf>) -> Self {
        Self {
            root: app_data_dir.into().join(ROOT_DIR),
        }
    }

    /// 用于单元测试或嵌入式调用的自定义根目录构造器。
    pub fn with_root(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// 查询指定服务器或全部服务器。不会启动服务器，也不会执行用户文件。
    pub fn status(
        &self,
        server_id: Option<&str>,
    ) -> Result<LspProvisionStatusResponse, CommandError> {
        let manifest = self.read_manifest()?;
        let servers = match server_id {
            Some(id) => vec![self.status_for(id, manifest.servers.get(id))?],
            None => manifest
                .servers
                .iter()
                .map(|(id, entry)| self.status_for(id, Some(entry)))
                .collect::<Result<Vec<_>, _>>()?,
        };
        Ok(LspProvisionStatusResponse { servers })
    }

    /// 下载、校验并安装一个服务器。下载完成前不会修改现有 manifest 或版本目录。
    pub async fn install(
        &self,
        request: LspInstallRequest,
    ) -> Result<LspProvisionStatus, CommandError> {
        validate_server_id(&request.server_id)?;
        validate_version(&request.version)?;
        validate_sha256(&request.sha256)?;
        let url = Url::parse(&request.download_url)
            .map_err(|error| CommandError::new("INVALID_DOWNLOAD_URL", error.to_string()))?;
        if !matches!(url.scheme(), "http" | "https") {
            return Err(CommandError::new(
                "INVALID_DOWNLOAD_URL",
                "语言服务器下载地址只允许 http 或 https",
            ));
        }
        validate_relative_path(
            request
                .executable_path
                .as_deref()
                .unwrap_or(&request.server_id),
        )?;
        if let Some(command) = request.launch_command.as_deref() {
            validate_relative_path(command)?;
        }

        let bytes = download_archive(url).await?;
        let expected = request.sha256.to_ascii_lowercase();
        let actual = hex_sha256(&bytes);
        if actual != expected {
            return Err(CommandError::new(
                "CHECKSUM_MISMATCH",
                format!("下载包 SHA-256 校验失败，期望 {expected}，实际 {actual}"),
            ));
        }

        let this = self.clone();
        Ok(
            task::spawn_blocking(move || this.install_bytes(&request, &bytes, &actual))
                .await
                .map_err(|error| CommandError::new("INSTALL_FAILED", error.to_string()))??,
        )
    }

    fn install_bytes(
        &self,
        request: &LspInstallRequest,
        bytes: &[u8],
        sha256: &str,
    ) -> Result<LspProvisionStatus, CommandError> {
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let parent = self.root.join(&request.server_id);
        fs::create_dir_all(&parent).map_err(io_error)?;
        let token = unique_token();
        let temp_download = parent.join(format!(".download-{token}.tmp"));
        write_atomic_file(&temp_download, bytes)?;

        let install_dir = parent.join(&request.version);
        let temp_install = parent.join(format!(".install-{token}.tmp"));
        let result = (|| {
            if temp_install.exists() {
                fs::remove_dir_all(&temp_install).map_err(io_error)?;
            }
            fs::create_dir_all(&temp_install).map_err(io_error)?;
            let executable_rel = request
                .executable_path
                .as_deref()
                .unwrap_or(&request.server_id);
            match request.archive_format {
                LspArchiveFormat::Binary => {
                    let executable = temp_install.join(executable_rel);
                    if let Some(parent) = executable.parent() {
                        fs::create_dir_all(parent).map_err(io_error)?;
                    }
                    fs::copy(&temp_download, &executable).map_err(io_error)?;
                    make_executable(&executable)?;
                }
                LspArchiveFormat::Zip => extract_zip(bytes, &temp_install)?,
                LspArchiveFormat::TarGz => extract_tar_gz(bytes, &temp_install)?,
                LspArchiveFormat::Gzip => {
                    extract_gzip_binary(bytes, &temp_install, executable_rel)?
                }
            }
            let executable = temp_install.join(executable_rel);
            if !executable.is_file() {
                return Err(CommandError::new(
                    "EXECUTABLE_NOT_FOUND",
                    format!("安装包中未找到可执行文件：{executable_rel}"),
                ));
            }
            if let Some(command) = request.launch_command.as_deref() {
                let launch_command = temp_install.join(command);
                if !launch_command.is_file() {
                    return Err(CommandError::new(
                        "LAUNCH_COMMAND_NOT_FOUND",
                        format!("安装包中未找到启动命令：{command}"),
                    ));
                }
            }
            if install_dir.exists() {
                fs::remove_dir_all(&install_dir).map_err(io_error)?;
            }
            fs::rename(&temp_install, &install_dir).map_err(io_error)?;
            Ok(())
        })();
        let _ = fs::remove_file(&temp_download);
        if result.is_err() {
            let _ = fs::remove_dir_all(&temp_install);
        }
        result?;

        let mut manifest = self.read_manifest()?;
        let executable_rel = request
            .executable_path
            .as_deref()
            .unwrap_or(&request.server_id)
            .to_string();
        manifest.servers.insert(
            request.server_id.clone(),
            ManifestEntry {
                version: request.version.clone(),
                install_dir: install_dir.to_string_lossy().to_string(),
                executable_path: executable_rel.clone(),
                launch_command: request.launch_command.clone(),
                launch_args: request.launch_args.clone(),
                launch_env: request
                    .launch_env
                    .iter()
                    .map(|(key, value)| (key.clone(), value.clone()))
                    .collect(),
                sha256: sha256.to_string(),
                size_bytes: bytes.len() as u64,
            },
        );
        self.write_manifest(&manifest)?;
        Ok(self.status_for(&request.server_id, manifest.servers.get(&request.server_id))?)
    }

    fn status_for(
        &self,
        server_id: &str,
        entry: Option<&ManifestEntry>,
    ) -> Result<LspProvisionStatus, CommandError> {
        validate_server_id(server_id)?;
        let Some(entry) = entry else {
            return Ok(LspProvisionStatus {
                server_id: server_id.to_string(),
                version: None,
                installed: false,
                install_dir: None,
                executable_path: None,
                launch_command: None,
                launch_args: Vec::new(),
                launch_env: Default::default(),
                sha256: None,
                size_bytes: None,
                error: None,
            });
        };
        let install_dir = PathBuf::from(&entry.install_dir);
        let executable = install_dir.join(&entry.executable_path);
        let installed = install_dir.is_dir() && executable.is_file();
        Ok(LspProvisionStatus {
            server_id: server_id.to_string(),
            version: Some(entry.version.clone()),
            installed,
            install_dir: Some(install_dir.to_string_lossy().to_string()),
            executable_path: Some(executable.to_string_lossy().to_string()),
            launch_command: Some(
                install_dir
                    .join(
                        entry
                            .launch_command
                            .as_deref()
                            .unwrap_or(&entry.executable_path),
                    )
                    .to_string_lossy()
                    .to_string(),
            ),
            launch_args: entry.launch_args.clone(),
            launch_env: entry.launch_env.clone().into_iter().collect(),
            sha256: Some(entry.sha256.clone()),
            size_bytes: Some(entry.size_bytes),
            error: (!installed).then(|| "manifest 存在，但可执行文件缺失".to_string()),
        })
    }

    fn read_manifest(&self) -> Result<Manifest, CommandError> {
        let path = self.root.join(MANIFEST_FILE);
        if !path.is_file() {
            return Ok(Manifest::default());
        }
        let data = fs::read(&path).map_err(io_error)?;
        serde_json::from_slice(&data)
            .map_err(|error| CommandError::new("MANIFEST_INVALID", error.to_string()))
    }

    fn write_manifest(&self, manifest: &Manifest) -> Result<(), CommandError> {
        fs::create_dir_all(&self.root).map_err(io_error)?;
        let data = serde_json::to_vec_pretty(manifest)
            .map_err(|error| CommandError::new("MANIFEST_INVALID", error.to_string()))?;
        let temp = self
            .root
            .join(format!(".{MANIFEST_FILE}.{}.tmp", unique_token()));
        write_atomic_file(&temp, &data)?;
        fs::rename(temp, self.root.join(MANIFEST_FILE)).map_err(io_error)
    }
}

/// 下载语言服务器归档。网络连接和超时错误、以及 408/425/429/5xx 响应会重试，
/// 其它 4xx 响应直接失败，避免把鉴权、地址错误等永久错误重复请求。
async fn download_archive(url: Url) -> Result<Vec<u8>, CommandError> {
    let client = reqwest::Client::builder()
        .connect_timeout(DOWNLOAD_CONNECT_TIMEOUT)
        .timeout(DOWNLOAD_TIMEOUT)
        .build()
        .map_err(|error| download_error("构造下载客户端失败", &error, 1, 1, &url))?;

    let mut last_error = None;
    for attempt in 1..=DOWNLOAD_MAX_ATTEMPTS {
        match client.get(url.clone()).send().await {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    match response.bytes().await {
                        Ok(bytes) => return Ok(bytes.to_vec()),
                        Err(error) => {
                            let retryable = error.is_timeout() || error.is_connect();
                            let command_error = download_error(
                                "读取下载响应失败",
                                &error,
                                attempt,
                                DOWNLOAD_MAX_ATTEMPTS,
                                &url,
                            );
                            if !retryable || attempt == DOWNLOAD_MAX_ATTEMPTS {
                                return Err(command_error);
                            }
                            last_error = Some(command_error);
                        }
                    }
                } else {
                    let error = response
                        .error_for_status()
                        .expect_err("non-success response must produce a reqwest error");
                    let retryable = retryable_status(status);
                    let command_error = download_error(
                        &format!("下载服务器返回 HTTP {status}"),
                        &error,
                        attempt,
                        DOWNLOAD_MAX_ATTEMPTS,
                        &url,
                    );
                    if !retryable || attempt == DOWNLOAD_MAX_ATTEMPTS {
                        return Err(command_error);
                    }
                    last_error = Some(command_error);
                }
            }
            Err(error) => {
                let retryable = error.is_timeout() || error.is_connect();
                let command_error = download_error(
                    "发送下载请求失败",
                    &error,
                    attempt,
                    DOWNLOAD_MAX_ATTEMPTS,
                    &url,
                );
                if !retryable || attempt == DOWNLOAD_MAX_ATTEMPTS {
                    return Err(command_error);
                }
                last_error = Some(command_error);
            }
        }

        if attempt < DOWNLOAD_MAX_ATTEMPTS {
            tokio::time::sleep(download_retry_delay(attempt)).await;
        }
    }

    Err(last_error
        .unwrap_or_else(|| CommandError::new("DOWNLOAD_FAILED", format!("下载失败：{url}"))))
}

fn retryable_status(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 408 | 425 | 429 | 500..=599)
}

fn download_retry_delay(attempt: usize) -> Duration {
    match attempt {
        1 => Duration::from_secs(1),
        2 => Duration::from_secs(3),
        _ => Duration::from_secs(8),
    }
}

fn download_error(
    context: &str,
    error: &reqwest::Error,
    attempt: usize,
    max_attempts: usize,
    url: &Url,
) -> CommandError {
    let mut causes = Vec::new();
    let mut source = error.source();
    while let Some(cause) = source {
        causes.push(cause.to_string());
        source = cause.source();
    }
    let cause_text = if causes.is_empty() {
        error.to_string()
    } else {
        format!("{}; cause: {}", error, causes.join(" -> "))
    };
    CommandError::new(
        "DOWNLOAD_FAILED",
        format!("{context}（第 {attempt}/{max_attempts} 次，地址：{url}）：{cause_text}"),
    )
}

fn extract_zip(bytes: &[u8], target: &Path) -> Result<(), CommandError> {
    let reader = io::Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|error| CommandError::new("ARCHIVE_INVALID", error.to_string()))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| CommandError::new("ARCHIVE_INVALID", error.to_string()))?;
        let name = file.name().replace('\\', "/");
        validate_relative_path(&name)?;
        let destination = target.join(&name);
        if file.is_dir() {
            fs::create_dir_all(&destination).map_err(io_error)?;
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(io_error)?;
        }
        let mut output = fs::File::create(&destination).map_err(io_error)?;
        io::copy(&mut file, &mut output).map_err(io_error)?;
        make_executable(&destination)?;
    }
    Ok(())
}

fn extract_tar_gz(bytes: &[u8], target: &Path) -> Result<(), CommandError> {
    let mut decoder = GzDecoder::new(io::Cursor::new(bytes));
    let mut decoded = Vec::new();
    decoder
        .read_to_end(&mut decoded)
        .map_err(|error| CommandError::new("ARCHIVE_INVALID", error.to_string()))?;
    let mut offset = 0usize;
    let mut links = Vec::new();
    let mut global_pax = PaxOverrides::default();
    let mut pending_pax = PaxOverrides::default();
    let mut pending_gnu_name: Option<String> = None;
    let mut pending_gnu_link: Option<String> = None;
    while offset + 512 <= decoded.len() {
        let header = &decoded[offset..offset + 512];
        if header.iter().all(|byte| *byte == 0) {
            break;
        }
        let raw_name = tar_text(&header[0..100]);
        let prefix = tar_text(&header[345..500]);
        let raw_path = if prefix.is_empty() {
            raw_name
        } else {
            format!("{prefix}/{raw_name}")
        };
        let header_size = parse_tar_octal(&header[124..136])?;
        let entry_type = header[156];
        let data_start = offset
            .checked_add(512)
            .ok_or_else(|| CommandError::new("ARCHIVE_INVALID", "tar 条目偏移溢出"))?;
        let data_end = data_start
            .checked_add(header_size)
            .ok_or_else(|| CommandError::new("ARCHIVE_INVALID", "tar 条目长度溢出"))?;
        if data_end > decoded.len() {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                "tar 条目超出压缩包边界",
            ));
        }

        if entry_type == b'x' || entry_type == b'g' {
            let overrides = parse_pax_records(&decoded[data_start..data_end])?;
            if entry_type == b'g' {
                global_pax.merge(overrides);
            } else {
                pending_pax.merge(overrides);
            }
        } else if entry_type == b'L' || entry_type == b'K' {
            let value = tar_long_name(&decoded[data_start..data_end]);
            if value.is_empty() {
                return Err(CommandError::new(
                    "ARCHIVE_INVALID",
                    "GNU tar 扩展头包含空路径",
                ));
            }
            if entry_type == b'L' {
                pending_gnu_name = Some(value);
            } else {
                pending_gnu_link = Some(value);
            }
        } else {
            let path = pending_pax
                .path
                .take()
                .or_else(|| global_pax.path.clone())
                .or_else(|| pending_gnu_name.take())
                .unwrap_or(raw_path);
            validate_relative_path(&path)?;
            let size = pending_pax
                .size
                .take()
                .or_else(|| global_pax.size)
                .unwrap_or(header_size);
            if size > header_size {
                return Err(CommandError::new(
                    "ARCHIVE_INVALID",
                    "PAX size 超过 tar 条目边界",
                ));
            }
            let destination = target.join(&path);
            let link_target = pending_pax
                .linkpath
                .take()
                .or_else(|| global_pax.linkpath.clone())
                .or_else(|| pending_gnu_link.take())
                .unwrap_or_else(|| tar_text(&header[157..257]));
            if entry_type == b'5' {
                fs::create_dir_all(&destination).map_err(io_error)?;
            } else if entry_type == 0 || entry_type == b'0' {
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(io_error)?;
                }
                fs::write(&destination, &decoded[data_start..data_start + size])
                    .map_err(io_error)?;
                make_executable(&destination)?;
            } else if entry_type == b'2' {
                queue_safe_tar_link(&mut links, &path, &link_target)?;
            } else if entry_type == b'1' {
                queue_safe_tar_hardlink(&mut links, &path, &link_target)?;
            } else {
                return Err(CommandError::new(
                    "ARCHIVE_INVALID",
                    format!("不支持的 tar 条目类型：{}", entry_type as char),
                ));
            }
        }
        let padded_size = header_size
            .checked_add(511)
            .map(|value| value / 512 * 512)
            .ok_or_else(|| CommandError::new("ARCHIVE_INVALID", "tar 条目长度溢出"))?;
        offset = data_start + padded_size;
    }
    materialize_tar_links(target, &links)?;
    Ok(())
}

#[derive(Debug, Default, Clone)]
struct PaxOverrides {
    path: Option<String>,
    linkpath: Option<String>,
    size: Option<usize>,
}

impl PaxOverrides {
    fn merge(&mut self, other: Self) {
        if other.path.is_some() {
            self.path = other.path;
        }
        if other.linkpath.is_some() {
            self.linkpath = other.linkpath;
        }
        if other.size.is_some() {
            self.size = other.size;
        }
    }
}

fn parse_pax_records(bytes: &[u8]) -> Result<PaxOverrides, CommandError> {
    let mut result = PaxOverrides::default();
    let mut offset = 0usize;
    while offset < bytes.len() {
        let Some(space_rel) = bytes[offset..].iter().position(|byte| *byte == b' ') else {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                "PAX 记录缺少长度分隔符",
            ));
        };
        let space = offset + space_rel;
        let length_text = std::str::from_utf8(&bytes[offset..space]).map_err(|error| {
            CommandError::new("ARCHIVE_INVALID", format!("PAX 记录长度无效：{error}"))
        })?;
        let record_len = length_text.parse::<usize>().map_err(|error| {
            CommandError::new("ARCHIVE_INVALID", format!("PAX 记录长度无效：{error}"))
        })?;
        if record_len < (space - offset + 3) || offset + record_len > bytes.len() {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                "PAX 记录超出扩展头边界",
            ));
        }
        let record = &bytes[offset..offset + record_len];
        if record.last() != Some(&b'\n') {
            return Err(CommandError::new("ARCHIVE_INVALID", "PAX 记录缺少换行符"));
        }
        let payload = &record[space - offset + 1..record_len - 1];
        let Some(equal) = payload.iter().position(|byte| *byte == b'=') else {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                "PAX 记录缺少键值分隔符",
            ));
        };
        let key = std::str::from_utf8(&payload[..equal]).map_err(|error| {
            CommandError::new("ARCHIVE_INVALID", format!("PAX 键名无效：{error}"))
        })?;
        let value = std::str::from_utf8(&payload[equal + 1..]).map_err(|error| {
            CommandError::new("ARCHIVE_INVALID", format!("PAX 值无效：{error}"))
        })?;
        match key {
            "path" => result.path = Some(value.to_string()),
            "linkpath" => result.linkpath = Some(value.to_string()),
            "size" => {
                result.size = Some(value.parse::<usize>().map_err(|error| {
                    CommandError::new("ARCHIVE_INVALID", format!("PAX size 无效：{error}"))
                })?);
            }
            _ => {}
        }
        offset += record_len;
    }
    Ok(result)
}

fn tar_long_name(bytes: &[u8]) -> String {
    let length = bytes
        .iter()
        .position(|byte| *byte == 0 || *byte == b'\n')
        .unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..length]).to_string()
}

#[derive(Debug, Clone)]
struct TarLink {
    path: String,
    target: String,
}

/// 只记录链接，不在安装目录创建 symlink/hardlink；最终统一物化为普通文件。
fn queue_safe_tar_link(
    links: &mut Vec<TarLink>,
    path: &str,
    target: &str,
) -> Result<(), CommandError> {
    let resolved = resolve_tar_link_path(path, target)?;
    if links.iter().any(|link| link.path == path) {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            format!("tar 条目重复：{path}"),
        ));
    }
    links.push(TarLink {
        path: path.to_string(),
        target: resolved,
    });
    Ok(())
}

fn queue_safe_tar_hardlink(
    links: &mut Vec<TarLink>,
    path: &str,
    target: &str,
) -> Result<(), CommandError> {
    let resolved = normalize_tar_root_path(target)?;
    if links.iter().any(|link| link.path == path) {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            format!("tar 条目重复：{path}"),
        ));
    }
    links.push(TarLink {
        path: path.to_string(),
        target: resolved,
    });
    Ok(())
}

fn materialize_tar_links(root: &Path, links: &[TarLink]) -> Result<(), CommandError> {
    let mut states = vec![0u8; links.len()];
    for index in 0..links.len() {
        materialize_tar_link(root, links, &mut states, index)?;
    }
    Ok(())
}

fn materialize_tar_link(
    root: &Path,
    links: &[TarLink],
    states: &mut [u8],
    index: usize,
) -> Result<(), CommandError> {
    if states[index] == 2 {
        return Ok(());
    }
    if states[index] == 1 {
        return Err(CommandError::new("ARCHIVE_INVALID", "tar 链接存在循环引用"));
    }
    states[index] = 1;
    let link = &links[index];
    let source = if let Some(source_index) = links
        .iter()
        .position(|candidate| candidate.path == link.target)
    {
        materialize_tar_link(root, links, states, source_index)?;
        root.join(&link.target)
    } else {
        root.join(&link.target)
    };
    if !source.is_file() {
        let reason = if source.is_dir() {
            "目标是目录"
        } else {
            "目标不存在或不是普通文件"
        };
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            format!(
                "tar 链接目标无效：{} -> {}（{reason}）",
                link.path, link.target
            ),
        ));
    }
    let destination = root.join(&link.path);
    if fs::symlink_metadata(&destination).is_ok() {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            format!("tar 链接目标路径已存在：{}", link.path),
        ));
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(io_error)?;
    }
    let data = fs::read(&source).map_err(io_error)?;
    fs::write(&destination, data).map_err(io_error)?;
    make_executable(&destination)?;
    states[index] = 2;
    Ok(())
}

fn resolve_tar_link_path(link_path: &str, link_target: &str) -> Result<String, CommandError> {
    if link_target.is_empty() || link_target.contains('\0') {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            "tar 链接目标不能为空或包含 NUL 字符",
        ));
    }
    let target = Path::new(link_target);
    if target.is_absolute()
        || target
            .components()
            .any(|component| matches!(component, Component::RootDir | Component::Prefix(_)))
    {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            "tar 链接目标不能是绝对路径",
        ));
    }
    let parent = Path::new(link_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let mut parts = Vec::new();
    for component in parent.join(target).components() {
        match component {
            Component::Normal(value) => parts.push(value.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir => {
                if parts.pop().is_none() {
                    return Err(CommandError::new(
                        "ARCHIVE_INVALID",
                        format!("tar 链接目标越出安装目录：{link_path} -> {link_target}"),
                    ));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(CommandError::new(
                    "ARCHIVE_INVALID",
                    "tar 链接目标不能包含根路径或盘符",
                ));
            }
        }
    }
    if parts.is_empty() {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            format!("tar 链接目标无效：{link_path} -> {link_target}"),
        ));
    }
    Ok(parts.join("/"))
}

fn normalize_tar_root_path(value: &str) -> Result<String, CommandError> {
    if value.is_empty() || value.contains('\0') {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            "tar 链接目标不能为空或包含 NUL 字符",
        ));
    }
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::RootDir | Component::Prefix(_)))
    {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            "tar 硬链接目标必须是安装根目录内的相对路径",
        ));
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => parts.push(value.to_string_lossy().into_owned()),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(CommandError::new(
                    "ARCHIVE_INVALID",
                    format!("tar 硬链接目标不能包含 ..：{value}"),
                ));
            }
            Component::RootDir | Component::Prefix(_) => unreachable!(),
        }
    }
    if parts.is_empty() {
        return Err(CommandError::new(
            "ARCHIVE_INVALID",
            format!("tar 硬链接目标无效：{value}"),
        ));
    }
    Ok(parts.join("/"))
}

fn extract_gzip_binary(
    bytes: &[u8],
    target: &Path,
    executable_rel: &str,
) -> Result<(), CommandError> {
    let mut decoder = GzDecoder::new(io::Cursor::new(bytes));
    let mut decoded = Vec::new();
    decoder
        .read_to_end(&mut decoded)
        .map_err(|error| CommandError::new("ARCHIVE_INVALID", error.to_string()))?;
    let destination = target.join(executable_rel);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(io_error)?;
    }
    fs::write(&destination, decoded).map_err(io_error)?;
    make_executable(&destination)
}

fn tar_text(bytes: &[u8]) -> String {
    let length = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..length]).trim().to_string()
}

fn parse_tar_octal(bytes: &[u8]) -> Result<usize, CommandError> {
    let text = tar_text(bytes);
    usize::from_str_radix(text.trim(), 8)
        .map_err(|error| CommandError::new("ARCHIVE_INVALID", format!("tar 长度无效：{error}")))
}

fn write_atomic_file(path: &Path, bytes: &[u8]) -> Result<(), CommandError> {
    let mut file = fs::File::create(path).map_err(io_error)?;
    file.write_all(bytes).map_err(io_error)?;
    file.sync_all().map_err(io_error)
}

fn hex_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn unique_token() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn validate_server_id(value: &str) -> Result<(), CommandError> {
    if value.is_empty()
        || value.len() > 80
        || value
            .chars()
            .any(|c| !(c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')))
    {
        return Err(CommandError::new(
            "INVALID_SERVER_ID",
            "serverId 只能包含字母、数字、点、下划线和短横线",
        ));
    }
    const TRUSTED_SERVER_IDS: &[&str] = &[
        "typescript-language-server",
        "typescript-sdk",
        "java-runtime",
        "dotnet-runtime",
        "dotnet-sdk",
        "pyright",
        "gopls",
        "rust-analyzer",
        "jdtls",
        "omnisharp",
        "clangd",
        "node-runtime",
    ];
    if !TRUSTED_SERVER_IDS.contains(&value) {
        return Err(CommandError::new(
            "UNSUPPORTED_SERVER_ID",
            "该语言服务器尚未进入应用受信任清单",
        ));
    }
    Ok(())
}

fn validate_version(value: &str) -> Result<(), CommandError> {
    if value.is_empty()
        || value.len() > 80
        || value.contains('/')
        || value.contains('\\')
        || value == "."
        || value == ".."
    {
        return Err(CommandError::new(
            "INVALID_VERSION",
            "version 不能包含路径分隔符",
        ));
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), CommandError> {
    if value.len() != 64 || !value.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(CommandError::new(
            "INVALID_SHA256",
            "sha256 必须是 64 位十六进制字符串",
        ));
    }
    Ok(())
}

fn validate_relative_path(value: &str) -> Result<(), CommandError> {
    let path = Path::new(value);
    if value.is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(CommandError::new(
            "INVALID_RELATIVE_PATH",
            "路径必须是安全的相对路径",
        ));
    }
    Ok(())
}

fn io_error(error: io::Error) -> CommandError {
    CommandError::io(error.to_string())
}

fn make_executable(path: &Path) -> Result<(), CommandError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = fs::metadata(path).map_err(io_error)?.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions).map_err(io_error)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn status_is_empty_without_manifest() {
        let dir = tempdir().unwrap();
        let response = LspProvisioner::with_root(dir.path())
            .status(Some("gopls"))
            .unwrap();
        assert!(!response.servers[0].installed);
    }

    #[test]
    fn validates_paths_and_hashes() {
        assert!(validate_server_id("../evil").is_err());
        assert!(validate_server_id("unknown-server").is_err());
        assert!(validate_relative_path("../evil").is_err());
        assert!(validate_sha256("abc").is_err());
        assert!(validate_sha256(&"a".repeat(64)).is_ok());
    }

    #[test]
    fn download_retry_policy_only_retries_transient_statuses() {
        for status in [408, 425, 429, 500, 502, 599] {
            assert!(retryable_status(
                reqwest::StatusCode::from_u16(status).unwrap()
            ));
        }
        for status in [200, 301, 400, 401, 403, 404, 410] {
            assert!(!retryable_status(
                reqwest::StatusCode::from_u16(status).unwrap()
            ));
        }
    }

    #[test]
    fn download_retry_delay_is_bounded_exponential_backoff() {
        assert_eq!(download_retry_delay(1), Duration::from_secs(1));
        assert_eq!(download_retry_delay(2), Duration::from_secs(3));
        assert_eq!(download_retry_delay(3), Duration::from_secs(8));
        assert_eq!(download_retry_delay(99), Duration::from_secs(8));
    }

    #[test]
    fn tar_gz_applies_pax_path_override() {
        let dir = tempdir().unwrap();
        let pax = pax_record("path", "long/path/entry.txt");
        let tar = make_tar(&[
            ("PaxHeaders.0/entry", b'x', "", &pax),
            ("entry", b'0', "", b"pax-content"),
        ]);
        let bytes = gzip_tar(&tar);
        extract_tar_gz(&bytes, dir.path()).unwrap();
        assert_eq!(
            fs::read(dir.path().join("long/path/entry.txt")).unwrap(),
            b"pax-content"
        );
    }

    #[test]
    fn binary_install_is_atomic_and_manifested() {
        let dir = tempdir().unwrap();
        let provisioner = LspProvisioner::with_root(dir.path());
        let bytes = b"fake-server";
        let hash = hex_sha256(bytes);
        let request = LspInstallRequest {
            server_id: "gopls".into(),
            version: "1.0.0".into(),
            download_url: "https://example.invalid/gopls".into(),
            sha256: hash.clone(),
            archive_format: LspArchiveFormat::Binary,
            executable_path: Some("bin/gopls".into()),
            launch_command: None,
            launch_args: Vec::new(),
            launch_env: Default::default(),
        };
        let status = provisioner.install_bytes(&request, bytes, &hash).unwrap();
        assert!(status.installed);
        assert_eq!(status.sha256.as_deref(), Some(hash.as_str()));
        assert!(dir.path().join("gopls/1.0.0/bin/gopls").is_file());
        assert!(dir.path().join(MANIFEST_FILE).is_file());
    }

    #[test]
    fn gzip_binary_is_extracted_and_marked_executable() {
        let dir = tempdir().unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(b"fake-rust-analyzer").unwrap();
        let bytes = encoder.finish().unwrap();
        extract_gzip_binary(&bytes, dir.path(), "bin/rust-analyzer").unwrap();
        assert_eq!(
            fs::read(dir.path().join("bin/rust-analyzer")).unwrap(),
            b"fake-rust-analyzer"
        );
    }

    #[test]
    fn tar_gz_rejects_escaping_symlink_entries() {
        let dir = tempdir().unwrap();
        let tar = make_tar(&[("link", b'2', "../../outside", b"")]);
        let bytes = gzip_tar(&tar);
        assert!(extract_tar_gz(&bytes, dir.path()).is_err());
    }

    #[test]
    fn tar_gz_materializes_safe_relative_symlink() {
        let dir = tempdir().unwrap();
        let tar = make_tar(&[
            ("bin/node", b'0', "", b"node-binary"),
            ("bin/npm", b'2', "node", b""),
        ]);
        let bytes = gzip_tar(&tar);
        extract_tar_gz(&bytes, dir.path()).unwrap();
        let link = dir.path().join("bin/npm");
        assert!(!fs::symlink_metadata(&link)
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read(dir.path().join("bin/npm")).unwrap(),
            b"node-binary"
        );
    }

    #[test]
    fn tar_gz_rejects_absolute_and_escaping_links() {
        let dir = tempdir().unwrap();
        for target in ["/etc/passwd", "../../outside", "bin/../../../outside"] {
            let tar = make_tar(&[("bin/link", b'2', target, b"")]);
            let bytes = gzip_tar(&tar);
            assert!(
                extract_tar_gz(&bytes, dir.path()).is_err(),
                "target={target}"
            );
        }
    }

    #[test]
    fn tar_gz_materializes_safe_hardlink() {
        let dir = tempdir().unwrap();
        let tar = make_tar(&[
            ("bin/node", b'0', "", b"node-binary"),
            ("bin/node-copy", b'1', "bin/node", b""),
        ]);
        let bytes = gzip_tar(&tar);
        extract_tar_gz(&bytes, dir.path()).unwrap();
        assert_eq!(
            fs::read(dir.path().join("bin/node-copy")).unwrap(),
            b"node-binary"
        );
    }

    fn gzip_tar(tar: &[u8]) -> Vec<u8> {
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(tar).unwrap();
        let bytes = encoder.finish().unwrap();
        bytes
    }

    fn make_tar(entries: &[(&str, u8, &str, &[u8])]) -> Vec<u8> {
        let mut archive = Vec::new();
        for (name, entry_type, link_name, data) in entries {
            let mut header = [0u8; 512];
            header[..name.len()].copy_from_slice(name.as_bytes());
            write_tar_octal(&mut header[100..108], 0o755);
            write_tar_octal(&mut header[108..116], 0);
            write_tar_octal(&mut header[116..124], 0);
            write_tar_octal(&mut header[124..136], data.len());
            write_tar_octal(&mut header[136..148], 0);
            header[148..156].fill(b' ');
            header[156] = *entry_type;
            header[157..157 + link_name.len()].copy_from_slice(link_name.as_bytes());
            header[257..263].copy_from_slice(b"ustar\0");
            header[263..265].copy_from_slice(b"00");
            let checksum: u32 = header.iter().map(|byte| u32::from(*byte)).sum();
            let checksum_text = format!("{checksum:06o}\0 ");
            header[148..156].copy_from_slice(checksum_text.as_bytes());
            archive.extend_from_slice(&header);
            archive.extend_from_slice(data);
            let padding = (512 - data.len() % 512) % 512;
            archive.extend(std::iter::repeat_n(0, padding));
        }
        archive.extend(std::iter::repeat_n(0, 1024));
        archive
    }

    fn write_tar_octal(field: &mut [u8], value: usize) {
        let text = format!("{:0width$o}\0", value, width = field.len() - 1);
        field.copy_from_slice(text.as_bytes());
    }

    fn pax_record(key: &str, value: &str) -> Vec<u8> {
        let body = format!("{key}={value}\n");
        let mut length = body.len() + 2;
        loop {
            let record = format!("{length} {body}");
            if record.len() == length {
                return record.into_bytes();
            }
            length = record.len();
        }
    }
}
