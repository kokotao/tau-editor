/// 设置相关命令模块
///
/// 实现自动保存配置、应用版本信息以及 GitHub Release 更新检查/下载安装能力。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::fs;
#[cfg(all(unix, not(target_os = "macos")))]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::time::{SystemTime, UNIX_EPOCH};

/// 自动保存间隔 (秒)
/// 使用原子变量保证线程安全
static AUTO_SAVE_INTERVAL: AtomicU64 = AtomicU64::new(0);

const PROJECT_HOMEPAGE_URL: &str = "https://github.com/kokotao/tau-editor";
const GITHUB_API_BASE: &str = "https://api.github.com/repos";
const HTTP_USER_AGENT: &str = "tau-editor-updater/1.0";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub build_target: String,
    pub homepage_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub os: String,
    pub arch: String,
}

impl DeviceInfo {
    fn current() -> Self {
        Self {
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAssetInfo {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    pub content_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_name: String,
    pub release_notes: String,
    pub release_url: String,
    pub published_at: Option<String>,
    pub selected_asset: Option<ReleaseAssetInfo>,
    pub device: DeviceInfo,
    pub repository_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadInstallResult {
    pub downloaded_path: String,
    pub launched: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseResponse {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GithubAssetResponse>,
}

#[derive(Debug, Deserialize, Clone)]
struct GithubAssetResponse {
    name: String,
    browser_download_url: String,
    size: u64,
    content_type: Option<String>,
}

impl From<GithubAssetResponse> for ReleaseAssetInfo {
    fn from(value: GithubAssetResponse) -> Self {
        Self {
            name: value.name,
            browser_download_url: value.browser_download_url,
            size: value.size,
            content_type: value.content_type,
        }
    }
}

/// 配置自动保存
///
/// # 参数
/// * `interval` - 自动保存间隔 (秒)
///   - 0 = 禁用自动保存
///   - 最小值：5 秒
///
/// # 返回
/// * `Ok(())` - 配置成功
/// * `Err(String)` - 错误信息
#[tauri::command]
pub fn auto_save_config(interval: u64) -> Result<(), String> {
    // 验证间隔：0 (禁用) 或 >= 5 秒
    if interval != 0 && interval < 5 {
        return Err("自动保存间隔最小为 5 秒".to_string());
    }

    // 更新配置
    AUTO_SAVE_INTERVAL.store(interval, AtomicOrdering::SeqCst);

    // 注意：实际的重启自动保存定时器逻辑需要在前端或单独的服务中实现
    // 这里只负责存储配置值

    Ok(())
}

/// 获取当前自动保存间隔
///
/// # 返回
/// * `u64` - 自动保存间隔 (秒)，0 表示禁用
#[tauri::command]
pub fn get_auto_save_interval() -> u64 {
    AUTO_SAVE_INTERVAL.load(AtomicOrdering::SeqCst)
}

/// 获取当前应用版本与设备信息
#[tauri::command]
pub fn get_app_version_info() -> AppVersionInfo {
    AppVersionInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        build_target: format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS),
        homepage_url: PROJECT_HOMEPAGE_URL.to_string(),
    }
}

/// 从 GitHub Releases 检查最新版本，并自动匹配当前设备推荐安装包。
#[tauri::command]
pub async fn check_github_update(repo_url: Option<String>) -> Result<GithubUpdateInfo, String> {
    let raw_repo_url = repo_url.unwrap_or_else(|| PROJECT_HOMEPAGE_URL.to_string());
    let (owner, repo) = parse_github_repo(&raw_repo_url)?;

    let release = match fetch_latest_release(&owner, &repo).await {
        Ok(release) => release,
        Err(api_error) => {
            if is_rate_limited_error(&api_error) {
                fetch_latest_release_from_web(&owner, &repo).await.map_err(|fallback_error| {
                    format!(
                        "GitHub API 已达到限流，网页回退也失败：{}（原始错误：{}）",
                        fallback_error, api_error
                    )
                })?
            } else {
                return Err(api_error);
            }
        }
    };
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let latest_version = normalize_version(&release.tag_name);
    let has_update = is_newer_version(&latest_version, &current_version);

    let device = DeviceInfo::current();
    let selected_asset = if has_update {
        choose_release_asset(&release.assets, &device.os, &device.arch).map(ReleaseAssetInfo::from)
    } else {
        None
    };

    Ok(GithubUpdateInfo {
        current_version,
        latest_version,
        has_update,
        release_name: release.name.unwrap_or_else(|| release.tag_name.clone()),
        release_notes: release.body.unwrap_or_default(),
        release_url: release.html_url,
        published_at: release.published_at,
        selected_asset,
        device,
        repository_url: format!("https://github.com/{owner}/{repo}"),
    })
}

fn is_rate_limited_error(message: &str) -> bool {
    let lower = message.to_lowercase();
    lower.contains("rate limit") || lower.contains("403")
}

/// 下载并触发安装。
///
/// 注意：不同系统对安装权限和交互要求不同，命令会尽力触发系统安装流程。
#[tauri::command]
pub async fn download_and_install_update(
    download_url: String,
    file_name: String,
) -> Result<DownloadInstallResult, String> {
    validate_download_url(&download_url)?;

    let download_path = build_download_path(&file_name)?;
    download_file(&download_url, &download_path).await?;

    let launch_message = launch_installer(&download_path)?;

    Ok(DownloadInstallResult {
        downloaded_path: download_path.to_string_lossy().to_string(),
        launched: true,
        message: launch_message,
    })
}

#[tauri::command]
pub fn open_project_homepage() -> Result<(), String> {
    open_external_url(PROJECT_HOMEPAGE_URL)
}

#[tauri::command]
pub fn open_external_link(url: String) -> Result<(), String> {
    open_external_url(&url)
}

#[tauri::command]
pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".to_string());
    }

    let target = PathBuf::from(trimmed);
    if !target.exists() {
        return Err("目标路径不存在".to_string());
    }

    open_in_file_manager(&target)
}

fn parse_github_repo(url: &str) -> Result<(String, String), String> {
    let trimmed = url.trim().trim_end_matches('/');

    let without_protocol = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .ok_or_else(|| "仓库地址必须以 http:// 或 https:// 开头".to_string())?;

    let without_domain = without_protocol
        .strip_prefix("github.com/")
        .ok_or_else(|| "当前仅支持 github.com 仓库地址".to_string())?;

    let mut segments = without_domain
        .split('/')
        .filter(|part| !part.trim().is_empty());

    let owner = segments
        .next()
        .ok_or_else(|| "GitHub 仓库地址缺少 owner".to_string())?
        .trim();

    let repo_raw = segments
        .next()
        .ok_or_else(|| "GitHub 仓库地址缺少 repo".to_string())?
        .trim();

    let repo = repo_raw.strip_suffix(".git").unwrap_or(repo_raw);

    if owner.is_empty() || repo.is_empty() {
        return Err("GitHub 仓库地址无效".to_string());
    }

    Ok((owner.to_string(), repo.to_string()))
}

fn normalize_version(raw: &str) -> String {
    raw.trim().trim_start_matches('v').to_string()
}

fn compare_versions(left: &str, right: &str) -> Ordering {
    let left_parts = parse_version_parts(left);
    let right_parts = parse_version_parts(right);

    let max_len = left_parts.len().max(right_parts.len());
    for index in 0..max_len {
        let a = *left_parts.get(index).unwrap_or(&0);
        let b = *right_parts.get(index).unwrap_or(&0);

        match a.cmp(&b) {
            Ordering::Equal => continue,
            non_eq => return non_eq,
        }
    }

    Ordering::Equal
}

fn parse_version_parts(raw: &str) -> Vec<u64> {
    let normalized = normalize_version(raw);
    let version_core = normalized
        .split(['-', '+'])
        .next()
        .unwrap_or("0");

    let mut parts = Vec::new();
    for part in version_core.split('.') {
        let numeric = part
            .chars()
            .take_while(|char| char.is_ascii_digit())
            .collect::<String>();
        parts.push(numeric.parse::<u64>().unwrap_or(0));
    }

    if parts.is_empty() {
        parts.push(0);
    }

    parts
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    compare_versions(latest, current) == Ordering::Greater
}

async fn fetch_latest_release(owner: &str, repo: &str) -> Result<GithubReleaseResponse, String> {
    let url = format!("{GITHUB_API_BASE}/{owner}/{repo}/releases/latest");

    let client = Client::builder()
        .user_agent(HTTP_USER_AGENT)
        .build()
        .map_err(|error| format!("初始化 HTTP 客户端失败：{error}"))?;

    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("请求 GitHub Release 失败：{error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let message = response
            .text()
            .await
            .unwrap_or_else(|_| "(无法读取错误详情)".to_string());
        let summary = message.chars().take(240).collect::<String>();
        return Err(format!(
            "GitHub Release 接口返回异常（{}）：{}",
            status,
            summary
        ));
    }

    response
        .json::<GithubReleaseResponse>()
        .await
        .map_err(|error| format!("解析 GitHub Release 数据失败：{error}"))
}

async fn fetch_latest_release_from_web(owner: &str, repo: &str) -> Result<GithubReleaseResponse, String> {
    let client = Client::builder()
        .user_agent(HTTP_USER_AGENT)
        .build()
        .map_err(|error| format!("初始化 HTTP 客户端失败：{error}"))?;

    let latest_url = format!("https://github.com/{owner}/{repo}/releases/latest");
    let latest_response = client
        .get(&latest_url)
        .send()
        .await
        .map_err(|error| format!("请求 GitHub Releases 页面失败：{error}"))?;

    if !latest_response.status().is_success() {
        return Err(format!(
            "GitHub Releases 页面返回异常：{}",
            latest_response.status()
        ));
    }

    let final_url = latest_response.url().to_string();
    let latest_body = latest_response
        .text()
        .await
        .map_err(|error| format!("读取 GitHub Releases 页面内容失败：{error}"))?;

    let tag_name = extract_tag_from_release_url(&final_url)
        .or_else(|| extract_tag_from_release_html(&latest_body, owner, repo))
        .ok_or_else(|| "无法从 GitHub 页面解析最新版本 tag".to_string())?;

    let mut assets = extract_release_assets_from_html(&latest_body, owner, repo);
    if assets.is_empty() {
        let expanded_assets_url =
            format!("https://github.com/{owner}/{repo}/releases/expanded_assets/{tag_name}");
        let expanded_response = client
            .get(&expanded_assets_url)
            .send()
            .await
            .map_err(|error| format!("请求 expanded assets 页面失败：{error}"))?;

        if expanded_response.status().is_success() {
            let expanded_body = expanded_response
                .text()
                .await
                .map_err(|error| format!("读取 expanded assets 页面内容失败：{error}"))?;
            assets = extract_release_assets_from_html(&expanded_body, owner, repo);
        }
    }

    let release_url = if final_url.contains("/releases/tag/") {
        final_url
    } else {
        format!("https://github.com/{owner}/{repo}/releases/tag/{tag_name}")
    };

    Ok(GithubReleaseResponse {
        tag_name: tag_name.clone(),
        name: Some(tag_name),
        body: None,
        html_url: release_url,
        published_at: None,
        assets,
    })
}

fn extract_tag_from_release_url(url: &str) -> Option<String> {
    url.split("/releases/tag/")
        .nth(1)
        .map(|value| {
            value
                .split(['?', '#'])
                .next()
                .unwrap_or(value)
                .trim_end_matches('/')
                .to_string()
        })
        .filter(|value| !value.is_empty())
}

fn extract_tag_from_release_html(html: &str, owner: &str, repo: &str) -> Option<String> {
    let marker = format!("/{owner}/{repo}/releases/tag/");
    html.find(&marker).and_then(|start| {
        let begin = start + marker.len();
        if begin >= html.len() {
            return None;
        }

        let mut end = begin;
        for (offset, ch) in html[begin..].char_indices() {
            if ch == '"' || ch == '\'' || ch == '<' || ch.is_whitespace() || ch == '?' || ch == '#' {
                end = begin + offset;
                break;
            }
        }
        if end == begin {
            end = html.len();
        }

        let tag = html[begin..end].trim_end_matches('/');
        if tag.is_empty() {
            None
        } else {
            Some(tag.to_string())
        }
    })
}

fn extract_release_assets_from_html(html: &str, owner: &str, repo: &str) -> Vec<GithubAssetResponse> {
    let marker = format!("/{owner}/{repo}/releases/download/");
    let mut cursor = 0usize;
    let mut seen = HashSet::new();
    let mut assets = Vec::new();

    while let Some(relative_start) = html[cursor..].find(&marker) {
        let start = cursor + relative_start;
        let mut end = start;
        for (offset, ch) in html[start..].char_indices() {
            if ch == '"' || ch == '\'' || ch == '<' || ch.is_whitespace() {
                end = start + offset;
                break;
            }
        }
        if end <= start {
            cursor = start.saturating_add(marker.len());
            continue;
        }

        let raw_path = &html[start..end];
        let path = raw_path.replace("&amp;", "&");
        let download_url = format!("https://github.com{path}");

        let file_name = path.rsplit('/').next().unwrap_or("").trim().to_string();
        if file_name.is_empty() || !seen.insert(download_url.clone()) {
            cursor = end;
            continue;
        }

        assets.push(GithubAssetResponse {
            name: file_name,
            browser_download_url: download_url,
            size: 0,
            content_type: None,
        });

        cursor = end;
    }

    assets
}

fn choose_release_asset(
    assets: &[GithubAssetResponse],
    os: &str,
    arch: &str,
) -> Option<GithubAssetResponse> {
    assets
        .iter()
        .filter_map(|asset| score_asset_name(&asset.name, os, arch).map(|score| (score, asset.clone())))
        .max_by(|(score_a, asset_a), (score_b, asset_b)| {
            score_a
                .cmp(score_b)
                .then_with(|| asset_a.size.cmp(&asset_b.size))
        })
        .map(|(_, asset)| asset)
}

fn score_asset_name(name: &str, os: &str, arch: &str) -> Option<i32> {
    let lower = name.to_lowercase();

    let disallowed_tokens = ["source code", ".sig", "sha256", "sha512", ".txt", ".json", ".yml", ".yaml"];
    if disallowed_tokens.iter().any(|token| lower.contains(token)) {
        return None;
    }

    let mut score = match os {
        "windows" => {
            if lower.ends_with(".msi") {
                120
            } else if lower.ends_with(".exe") {
                110
            } else {
                return None;
            }
        }
        "macos" => {
            if lower.ends_with(".dmg") {
                120
            } else if lower.ends_with(".pkg") {
                112
            } else if lower.ends_with(".zip") {
                70
            } else {
                return None;
            }
        }
        "linux" => {
            if lower.ends_with(".appimage") {
                130
            } else if lower.ends_with(".deb") {
                120
            } else if lower.ends_with(".rpm") {
                110
            } else if lower.ends_with(".tar.gz") {
                70
            } else {
                return None;
            }
        }
        _ => return None,
    };

    if is_arch_match(&lower, arch) {
        score += 40;
    } else if has_other_arch_token(&lower, arch) {
        score -= 25;
    } else {
        score += 6;
    }

    if os == "macos" && lower.contains("universal") {
        score += 32;
    }

    if contains_os_hint(&lower, os) {
        score += 20;
    }

    if os == "windows" && lower.contains("setup") {
        score += 8;
    }

    Some(score)
}

fn contains_os_hint(name: &str, os: &str) -> bool {
    match os {
        "windows" => ["windows", "win", "setup", "msi", "exe"]
            .iter()
            .any(|token| name.contains(token)),
        "macos" => ["mac", "macos", "darwin", "osx", "dmg", "pkg"]
            .iter()
            .any(|token| name.contains(token)),
        "linux" => ["linux", "appimage", "deb", "rpm"]
            .iter()
            .any(|token| name.contains(token)),
        _ => false,
    }
}

fn is_arch_match(name: &str, arch: &str) -> bool {
    arch_tokens(arch)
        .iter()
        .any(|token| name.contains(token))
}

fn has_other_arch_token(name: &str, arch: &str) -> bool {
    all_arch_tokens()
        .iter()
        .any(|token| name.contains(token) && !arch_tokens(arch).contains(token))
}

fn arch_tokens(arch: &str) -> &'static [&'static str] {
    match arch {
        "x86_64" => &["x86_64", "amd64", "x64"],
        "aarch64" => &["aarch64", "arm64"],
        "x86" => &["x86", "i386", "i686"],
        _ => &[],
    }
}

fn all_arch_tokens() -> &'static [&'static str] {
    &["x86_64", "amd64", "x64", "aarch64", "arm64", "x86", "i386", "i686"]
}

fn validate_download_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("仅允许下载 http/https 链接".to_string());
    }

    Ok(())
}

fn build_download_path(file_name: &str) -> Result<PathBuf, String> {
    let mut dir = std::env::temp_dir();
    dir.push("tau-editor-updates");

    fs::create_dir_all(&dir).map_err(|error| format!("创建更新目录失败：{error}"))?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间异常：{error}"))?
        .as_secs();

    let safe_file_name = sanitize_file_name(file_name);
    dir.push(format!("{timestamp}_{safe_file_name}"));

    Ok(dir)
}

fn sanitize_file_name(file_name: &str) -> String {
    let mut sanitized = file_name
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || char == '.' || char == '_' || char == '-' {
                char
            } else {
                '_'
            }
        })
        .collect::<String>();

    if sanitized.is_empty() {
        sanitized = "update-package.bin".to_string();
    }

    sanitized
}

async fn download_file(url: &str, path: &Path) -> Result<(), String> {
    let client = Client::builder()
        .user_agent(HTTP_USER_AGENT)
        .build()
        .map_err(|error| format!("初始化 HTTP 客户端失败：{error}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("下载更新包失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("下载更新包失败，HTTP 状态码：{}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取更新包内容失败：{error}"))?;

    tokio::fs::write(path, &bytes)
        .await
        .map_err(|error| format!("写入更新包失败：{error}"))
}

#[cfg(target_os = "windows")]
fn launch_installer(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if extension == "msi" {
        Command::new("msiexec")
            .arg("/i")
            .arg(path)
            .arg("/passive")
            .spawn()
            .map_err(|error| format!("启动 MSI 安装器失败：{error}"))?;

        return Ok("已启动 MSI 安装流程，请按系统提示完成安装。".to_string());
    }

    Command::new("cmd")
        .args(["/C", "start", "", ""])
        .arg(path)
        .spawn()
        .map_err(|error| format!("启动安装器失败：{error}"))?;

    Ok("已启动安装器，请按系统提示完成安装。".to_string())
}

#[cfg(target_os = "macos")]
fn launch_installer(path: &Path) -> Result<String, String> {
    Command::new("open")
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开安装包失败：{error}"))?;

    Ok("已打开安装包，请按系统提示完成安装。".to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn launch_installer(path: &Path) -> Result<String, String> {
    let lower_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if lower_name.ends_with(".appimage") {
        let mut permissions = fs::metadata(path)
            .map_err(|error| format!("读取更新包权限失败：{error}"))?
            .permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(path, permissions)
            .map_err(|error| format!("设置更新包执行权限失败：{error}"))?;

        Command::new(path)
            .spawn()
            .map_err(|error| format!("启动 AppImage 失败：{error}"))?;

        return Ok("已启动 AppImage 安装程序。".to_string());
    }

    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|error| format!("打开安装包失败：{error}"))?;

    Ok("已打开安装包，请按系统提示完成安装。".to_string())
}

fn open_external_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("仅允许打开 http/https 链接".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(url);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(url);
        cmd
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("打开浏览器失败：{error}"))
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        if path.is_file() {
            command.arg("-R").arg(path);
        } else {
            command.arg(path);
        }
        command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("打开文件管理器失败：{error}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer");
        if path.is_file() {
            command.arg(format!("/select,{}", path.display()));
        } else {
            command.arg(path);
        }
        command
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("打开文件管理器失败：{error}"))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let open_target = if path.is_dir() {
            path.to_path_buf()
        } else {
            path.parent().map(Path::to_path_buf).unwrap_or_else(|| path.to_path_buf())
        };
        Command::new("xdg-open")
            .arg(open_target)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("打开文件管理器失败：{error}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_auto_save_config_zero() {
        let _guard = TEST_LOCK.lock().expect("test lock poisoned");
        assert!(auto_save_config(0).is_ok());
        assert_eq!(get_auto_save_interval(), 0);
    }

    #[test]
    fn test_auto_save_config_valid() {
        let _guard = TEST_LOCK.lock().expect("test lock poisoned");
        assert!(auto_save_config(30).is_ok());
        assert_eq!(get_auto_save_interval(), 30);
    }

    #[test]
    fn test_auto_save_config_too_small() {
        let _guard = TEST_LOCK.lock().expect("test lock poisoned");
        assert!(auto_save_config(3).is_err());
    }

    #[test]
    fn test_auto_save_config_minimum() {
        let _guard = TEST_LOCK.lock().expect("test lock poisoned");
        assert!(auto_save_config(5).is_ok());
        assert_eq!(get_auto_save_interval(), 5);
    }

    #[test]
    fn test_parse_github_repo_success() {
        let result = parse_github_repo("https://github.com/kokotao/tau-editor/");
        assert_eq!(result.unwrap(), ("kokotao".to_string(), "tau-editor".to_string()));
    }

    #[test]
    fn test_parse_github_repo_failure() {
        assert!(parse_github_repo("https://gitlab.com/demo/repo").is_err());
        assert!(parse_github_repo("invalid-url").is_err());
    }

    #[test]
    fn test_version_compare() {
        assert!(is_newer_version("0.3.0", "0.2.9"));
        assert!(is_newer_version("v1.0.0", "0.9.9"));
        assert!(!is_newer_version("0.2.0", "0.2.0"));
        assert!(!is_newer_version("0.2.0", "0.3.0"));
    }

    #[test]
    fn test_choose_release_asset_for_linux_x64() {
        let assets = vec![
            GithubAssetResponse {
                name: "tau-editor_0.2.1_arm64.deb".to_string(),
                browser_download_url: "https://example.com/a.deb".to_string(),
                size: 10,
                content_type: Some("application/octet-stream".to_string()),
            },
            GithubAssetResponse {
                name: "tau-editor_0.2.1_amd64.deb".to_string(),
                browser_download_url: "https://example.com/b.deb".to_string(),
                size: 20,
                content_type: Some("application/octet-stream".to_string()),
            },
            GithubAssetResponse {
                name: "Source code (zip)".to_string(),
                browser_download_url: "https://example.com/source.zip".to_string(),
                size: 30,
                content_type: Some("application/zip".to_string()),
            },
        ];

        let selected = choose_release_asset(&assets, "linux", "x86_64")
            .expect("expected a matched asset");

        assert_eq!(selected.name, "tau-editor_0.2.1_amd64.deb");
    }

    #[test]
    fn test_sanitize_file_name() {
        assert_eq!(sanitize_file_name("tau editor 0.2.0.dmg"), "tau_editor_0.2.0.dmg");
        assert_eq!(sanitize_file_name(""), "update-package.bin");
    }

    #[test]
    fn test_extract_release_assets_from_html() {
        let html = r#"
            <a href="/kokotao/tau-editor/releases/download/v0.2.1/Tau%20Editor_0.2.1_aarch64.dmg">dmg</a>
            <a href="/kokotao/tau-editor/releases/download/v0.2.1/Tau%20Editor_0.2.1_aarch64.dmg">duplicate</a>
            <a href="/kokotao/tau-editor/releases/download/v0.2.1/Tau%20Editor_0.2.1_x64.msi">msi</a>
        "#;

        let assets = extract_release_assets_from_html(html, "kokotao", "tau-editor");
        assert_eq!(assets.len(), 2);
        assert!(assets.iter().any(|asset| asset.name.contains(".dmg")));
        assert!(assets.iter().any(|asset| asset.name.contains(".msi")));
    }

    #[test]
    fn test_extract_tag_from_release_url() {
        let url = "https://github.com/kokotao/tau-editor/releases/tag/v0.2.1?expanded=true";
        let tag = extract_tag_from_release_url(url).expect("tag should exist");
        assert_eq!(tag, "v0.2.1");
    }

    #[test]
    fn test_is_rate_limited_error() {
        assert!(is_rate_limited_error("GitHub Release 接口返回异常（403）：API rate limit exceeded"));
        assert!(!is_rate_limited_error("network timeout"));
    }
}
