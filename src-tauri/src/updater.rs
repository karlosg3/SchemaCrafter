use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/karlosg3/SchemaCrafter/releases/latest";
const GITHUB_RELEASES_PAGE_URL: &str = "https://github.com/karlosg3/SchemaCrafter/releases/latest";

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub tag: String,
    pub update_available: bool,
    pub release_url: String,
    pub release_notes: String,
    pub published_at: Option<String>,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub asset_size: Option<u64>,
    pub checksum_url: Option<String>,
    pub can_auto_install: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallUpdateRequest {
    pub asset_name: String,
    pub asset_url: String,
    pub checksum_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressEvent {
    pub stage: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallUpdateResult {
    /// "installed" | "cancelled" | "manual"
    pub status: String,
    pub downloaded_path: Option<String>,
    pub install_command: Option<String>,
    pub message: Option<String>,
}

/// Parses a strict `X.Y.Z` semver string with an optional leading `v`.
pub fn parse_semver(raw: &str) -> Option<(u64, u64, u64)> {
    let trimmed = raw.trim().strip_prefix('v').unwrap_or(raw.trim());
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next()?.parse::<u64>().ok()?;
    let patch = parts.next()?.parse::<u64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

/// Returns `true` when `candidate` is strictly newer than `current`.
pub fn is_newer_version(current: &str, candidate: &str) -> bool {
    match (parse_semver(current), parse_semver(candidate)) {
        (Some(cur), Some(cand)) => cand > cur,
        _ => false,
    }
}

fn target_deb_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        "arm" => "armhf",
        "x86" => "i386",
        other => other,
    }
}

fn pick_deb_asset<'a>(assets: &'a [GithubAsset], arch: &str) -> Option<&'a GithubAsset> {
    let debs: Vec<&GithubAsset> = assets
        .iter()
        .filter(|a| a.name.to_ascii_lowercase().ends_with(".deb"))
        .collect();
    if debs.is_empty() {
        return None;
    }

    let arch_lower = arch.to_ascii_lowercase();
    debs.iter()
        .copied()
        .find(|a| {
            let name = a.name.to_ascii_lowercase();
            name.contains(&format!("_{arch_lower}.deb"))
                || name.contains(&format!("-{arch_lower}.deb"))
        })
        .or_else(|| (debs.len() == 1).then_some(debs[0]))
}

/// Parses standard `sha256sum` output (`<hex>  <filename>` or `<hex> *<filename>`).
pub fn parse_sha256_for_asset(checksums_text: &str, filename: &str) -> Option<String> {
    for line in checksums_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.split_whitespace();
        let hash = parts.next()?;
        let raw_name = parts.next()?;
        let normalized_name = raw_name.trim_start_matches('*');
        let base_name = normalized_name
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or(normalized_name);
        if base_name == filename && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())
        {
            return Some(hash.to_ascii_lowercase());
        }
    }
    None
}

/// Strict allowlist for official SchemaCrafter release download URLs.
pub fn is_allowed_release_url(url: &str) -> bool {
    url.starts_with("https://github.com/karlosg3/SchemaCrafter/")
        || url.starts_with("https://objects.githubusercontent.com/")
        || url.starts_with("https://release-assets.githubusercontent.com/")
}

/// Strict allowlist for external browser links opened by the app.
pub fn is_allowed_external_url(url: &str) -> bool {
    url.starts_with("https://github.com/karlosg3/SchemaCrafter")
        || url.starts_with("https://schemacrafter.netlify.app")
}

/// Validates a `.deb` filename to prevent path traversal.
pub fn is_safe_deb_filename(name: &str) -> bool {
    !name.is_empty()
        && name.to_ascii_lowercase().ends_with(".deb")
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

fn build_http_client(app_version: &str, timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("SchemaCrafter-Desktop/{app_version}"))
        .timeout(timeout)
        .build()
        .map_err(|err| format!("Failed to initialize HTTP client: {err}"))
}

fn emit_progress(
    app: &tauri::AppHandle,
    stage: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
) {
    let percent = total_bytes
        .filter(|&t| t > 0)
        .map(|total| ((downloaded_bytes.saturating_mul(100)) / total).min(100) as u8);
    let _ = app.emit(
        "update-progress",
        UpdateProgressEvent {
            stage: stage.to_owned(),
            downloaded_bytes,
            total_bytes,
            percent,
        },
    );
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();
    let client = build_http_client(&current_version, Duration::from_secs(12))?;

    let response = client
        .get(GITHUB_LATEST_RELEASE_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| format!("Could not reach GitHub Releases: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub Releases responded with HTTP {}",
            response.status().as_u16()
        ));
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|err| format!("Invalid GitHub Releases payload: {err}"))?;

    if release.draft || release.prerelease {
        return Ok(UpdateCheckResult {
            current_version: current_version.clone(),
            latest_version: current_version.clone(),
            tag: format!("v{current_version}"),
            update_available: false,
            release_url: release
                .html_url
                .unwrap_or_else(|| GITHUB_RELEASES_PAGE_URL.to_owned()),
            release_notes: String::new(),
            published_at: release.published_at,
            asset_name: None,
            asset_url: None,
            asset_size: None,
            checksum_url: None,
            can_auto_install: false,
        });
    }

    let latest_version = release
        .tag_name
        .trim()
        .strip_prefix('v')
        .unwrap_or(release.tag_name.trim())
        .to_owned();
    let update_available = is_newer_version(&current_version, &latest_version);
    let deb_asset = pick_deb_asset(&release.assets, target_deb_arch());
    let checksum_asset = release
        .assets
        .iter()
        .find(|a| a.name.eq_ignore_ascii_case("SHA256SUMS.txt"));

    let can_auto_install = cfg!(target_os = "linux")
        && deb_asset
            .map(|a| is_allowed_release_url(&a.browser_download_url))
            .unwrap_or(false);

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        tag: release.tag_name,
        update_available,
        release_url: release
            .html_url
            .unwrap_or_else(|| GITHUB_RELEASES_PAGE_URL.to_owned()),
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at,
        asset_name: deb_asset.map(|a| a.name.clone()),
        asset_url: deb_asset.map(|a| a.browser_download_url.clone()),
        asset_size: deb_asset.map(|a| a.size),
        checksum_url: checksum_asset.map(|a| a.browser_download_url.clone()),
        can_auto_install,
    })
}

#[tauri::command]
pub async fn install_deb_update(
    app: tauri::AppHandle,
    request: InstallUpdateRequest,
) -> Result<InstallUpdateResult, String> {
    if !is_safe_deb_filename(&request.asset_name) {
        return Err("Invalid update package filename.".into());
    }
    if !is_allowed_release_url(&request.asset_url) {
        return Err(
            "Update download URL is not from the official SchemaCrafter repository.".into(),
        );
    }
    if let Some(ref csum_url) = request.checksum_url
        && !is_allowed_release_url(csum_url)
    {
        return Err("Checksum URL is not from the official SchemaCrafter repository.".into());
    }

    let current_version = app.package_info().version.to_string();
    let client = build_http_client(&current_version, Duration::from_secs(300))?;

    // Download into a world-readable temp folder so Linux `_apt` can read the .deb cleanly.
    let updates_dir: PathBuf = std::env::temp_dir().join("schemacrafter-updates");
    tokio::fs::create_dir_all(&updates_dir)
        .await
        .map_err(|err| format!("Failed to prepare updates directory: {err}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&updates_dir, std::fs::Permissions::from_mode(0o755));
    }

    let deb_path = updates_dir.join(&request.asset_name);
    let partial_path = updates_dir.join(format!("{}.part", request.asset_name));

    emit_progress(&app, "downloading", 0, None);

    let response = client
        .get(&request.asset_url)
        .send()
        .await
        .map_err(|err| format!("Failed to download update package: {err}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download server returned HTTP {}",
            response.status().as_u16()
        ));
    }

    let total_bytes = response.content_length();
    let mut file = tokio::fs::File::create(&partial_path)
        .await
        .map_err(|err| format!("Failed to create temporary update file: {err}"))?;

    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut last_emitted_pct: Option<u8> = None;
    let mut stream = response.bytes_stream();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|err| format!("Download interrupted: {err}"))?;
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|err| format!("Failed writing update package: {err}"))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        let pct = total_bytes
            .filter(|&t| t > 0)
            .map(|t| ((downloaded.saturating_mul(100)) / t).min(100) as u8);
        if pct != last_emitted_pct || total_bytes.is_none() {
            last_emitted_pct = pct;
            emit_progress(&app, "downloading", downloaded, total_bytes);
        }
    }

    file.flush()
        .await
        .map_err(|err| format!("Failed finalizing update package: {err}"))?;
    drop(file);

    emit_progress(&app, "verifying", downloaded, total_bytes);
    let computed_sha256 = hex::encode(hasher.finalize());

    if let Some(ref checksum_url) = request.checksum_url {
        let checksum_resp = client
            .get(checksum_url)
            .send()
            .await
            .map_err(|err| format!("Failed to download SHA256SUMS.txt: {err}"))?;

        if checksum_resp.status().is_success() {
            let text = checksum_resp
                .text()
                .await
                .map_err(|err| format!("Failed to read SHA256SUMS.txt: {err}"))?;
            if let Some(expected) = parse_sha256_for_asset(&text, &request.asset_name)
                && expected != computed_sha256
            {
                let _ = tokio::fs::remove_file(&partial_path).await;
                return Err(format!(
                    "SHA-256 verification failed for {}. The download may be corrupted.",
                    request.asset_name
                ));
            }
        }
    }

    tokio::fs::rename(&partial_path, &deb_path)
        .await
        .map_err(|err| format!("Failed staging verified package: {err}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&deb_path, std::fs::Permissions::from_mode(0o644));
    }

    let deb_path_str = deb_path.to_string_lossy().into_owned();
    let manual_cmd = format!("sudo apt install -y \"{deb_path_str}\"");

    #[cfg(target_os = "linux")]
    {
        emit_progress(&app, "installing", downloaded, total_bytes);

        let output = tokio::process::Command::new("pkexec")
            .args([
                "apt-get",
                "install",
                "-y",
                "--allow-downgrades",
                &deb_path_str,
            ])
            .output()
            .await;

        match output {
            Ok(out) if out.status.success() => {
                let _ = tokio::fs::remove_file(&deb_path).await;
                emit_progress(&app, "installed", downloaded, total_bytes);
                Ok(InstallUpdateResult {
                    status: "installed".into(),
                    downloaded_path: None,
                    install_command: None,
                    message: Some("Update installed cleanly. Restart SchemaCrafter to use the new version.".into()),
                })
            }
            Ok(out) if out.status.code() == Some(126) => Ok(InstallUpdateResult {
                status: "cancelled".into(),
                downloaded_path: Some(deb_path_str),
                install_command: Some(manual_cmd),
                message: Some("Authentication was cancelled.".into()),
            }),
            Ok(out) => {
                let stderr = String::from_utf8_lossy(&out.stderr).trim().to_owned();
                let message = if stderr.is_empty() {
                    format!(
                        "Automatic installer exited with status {:?}. Install manually with the command below.",
                        out.status.code()
                    )
                } else {
                    stderr
                };
                Ok(InstallUpdateResult {
                    status: "manual".into(),
                    downloaded_path: Some(deb_path_str),
                    install_command: Some(manual_cmd),
                    message: Some(message),
                })
            }
            Err(_) => Ok(InstallUpdateResult {
                status: "manual".into(),
                downloaded_path: Some(deb_path_str),
                install_command: Some(manual_cmd),
                message: Some(
                    "System policy authentication (pkexec) is unavailable. Run the command below in a terminal to complete the upgrade.".into(),
                ),
            }),
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        Ok(InstallUpdateResult {
            status: "manual".into(),
            downloaded_path: Some(deb_path_str),
            install_command: Some(manual_cmd),
            message: Some(
                "Package downloaded. Install it manually to complete the upgrade.".into(),
            ),
        })
    }
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    if !is_allowed_external_url(&url) {
        return Err("Refused to open untrusted URL.".into());
    }

    #[cfg(target_os = "linux")]
    let spawn_result = std::process::Command::new("xdg-open").arg(&url).spawn();
    #[cfg(target_os = "macos")]
    let spawn_result = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(target_os = "windows")]
    let spawn_result = std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn();

    spawn_result
        .map(|_| ())
        .map_err(|err| format!("Failed to open browser: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_semver_versions_numerically() {
        assert_eq!(parse_semver("0.1.0"), Some((0, 1, 0)));
        assert_eq!(parse_semver("v1.12.3"), Some((1, 12, 3)));
        assert_eq!(parse_semver("v1.0.0-beta.1"), None);

        assert!(is_newer_version("0.1.0", "0.1.1"));
        assert!(is_newer_version("1.0.9", "1.0.10"));
        assert!(is_newer_version("0.1.0", "v1.0.0"));
        assert!(!is_newer_version("1.0.10", "1.0.9"));
        assert!(!is_newer_version("1.2.0", "v1.2.0"));
    }

    #[test]
    fn picks_matching_architecture_deb_asset() {
        let assets = vec![
            GithubAsset {
                name: "SHA256SUMS.txt".into(),
                browser_download_url: "https://github.com/karlosg3/SchemaCrafter/releases/download/v1.0.0/SHA256SUMS.txt".into(),
                size: 120,
            },
            GithubAsset {
                name: "SchemaCrafter_1.0.0_arm64.deb".into(),
                browser_download_url: "https://github.com/karlosg3/SchemaCrafter/releases/download/v1.0.0/SchemaCrafter_1.0.0_arm64.deb".into(),
                size: 12_000_000,
            },
            GithubAsset {
                name: "SchemaCrafter_1.0.0_amd64.deb".into(),
                browser_download_url: "https://github.com/karlosg3/SchemaCrafter/releases/download/v1.0.0/SchemaCrafter_1.0.0_amd64.deb".into(),
                size: 13_000_000,
            },
        ];

        let amd64 = pick_deb_asset(&assets, "amd64").expect("amd64 deb");
        assert_eq!(amd64.name, "SchemaCrafter_1.0.0_amd64.deb");

        let arm64 = pick_deb_asset(&assets, "arm64").expect("arm64 deb");
        assert_eq!(arm64.name, "SchemaCrafter_1.0.0_arm64.deb");
    }

    #[test]
    fn parses_sha256sums_entries_and_validates_urls() {
        let hash = "a".repeat(64);
        let sums = format!("{hash}  SchemaCrafter_1.0.5_amd64.deb\n");
        assert_eq!(
            parse_sha256_for_asset(&sums, "SchemaCrafter_1.0.5_amd64.deb"),
            Some(hash)
        );
        assert_eq!(parse_sha256_for_asset(&sums, "other.deb"), None);

        assert!(is_allowed_release_url(
            "https://github.com/karlosg3/SchemaCrafter/releases/download/v1.0.5/SchemaCrafter_1.0.5_amd64.deb"
        ));
        assert!(!is_allowed_release_url("https://evil.example.com/app.deb"));
        assert!(is_safe_deb_filename("SchemaCrafter_1.0.5_amd64.deb"));
        assert!(!is_safe_deb_filename("../evil.deb"));
        assert!(!is_safe_deb_filename("script.sh"));
    }
}
