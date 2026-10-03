/**
 * @description 应用私有语言服务器下载、校验、安装与状态管理
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 16:20
 */
use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

        let response = reqwest::Client::new()
            .get(url)
            .send()
            .await
            .map_err(|error| CommandError::new("DOWNLOAD_FAILED", error.to_string()))?
            .error_for_status()
            .map_err(|error| CommandError::new("DOWNLOAD_FAILED", error.to_string()))?;
        let bytes = response
            .bytes()
            .await
            .map_err(|error| CommandError::new("DOWNLOAD_FAILED", error.to_string()))?;
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
    while offset + 512 <= decoded.len() {
        let header = &decoded[offset..offset + 512];
        if header.iter().all(|byte| *byte == 0) {
            break;
        }
        let name = tar_text(&header[0..100]);
        let prefix = tar_text(&header[345..500]);
        let path = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        validate_relative_path(&path)?;
        let size = parse_tar_octal(&header[124..136])?;
        let entry_type = header[156];
        if entry_type == b'2' || entry_type == b'1' {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                "tar 包不允许包含符号链接或硬链接",
            ));
        }
        let destination = target.join(&path);
        let data_start = offset
            .checked_add(512)
            .ok_or_else(|| CommandError::new("ARCHIVE_INVALID", "tar 条目偏移溢出"))?;
        let data_end = data_start
            .checked_add(size)
            .ok_or_else(|| CommandError::new("ARCHIVE_INVALID", "tar 条目长度溢出"))?;
        if data_end > decoded.len() {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                "tar 条目超出压缩包边界",
            ));
        }
        if entry_type == b'5' {
            fs::create_dir_all(&destination).map_err(io_error)?;
        } else if entry_type == 0 || entry_type == b'0' {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(io_error)?;
            }
            fs::write(&destination, &decoded[data_start..data_end]).map_err(io_error)?;
            make_executable(&destination)?;
        } else {
            return Err(CommandError::new(
                "ARCHIVE_INVALID",
                format!("不支持的 tar 条目类型：{}", entry_type as char),
            ));
        }
        let padded_size = size
            .checked_add(511)
            .map(|value| value / 512 * 512)
            .ok_or_else(|| CommandError::new("ARCHIVE_INVALID", "tar 条目长度溢出"))?;
        offset = data_start + padded_size;
    }
    Ok(())
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
    fn tar_gz_rejects_symlink_entries() {
        let dir = tempdir().unwrap();
        let mut tar = vec![0u8; 1024];
        tar[..4].copy_from_slice(b"link");
        tar[156] = b'2';
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar).unwrap();
        let bytes = encoder.finish().unwrap();
        assert!(extract_tar_gz(&bytes, dir.path()).is_err());
    }
}
