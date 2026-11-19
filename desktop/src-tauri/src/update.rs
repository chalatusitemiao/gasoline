use std::{
    fs::{File, OpenOptions},
    io::{self, Read, Seek, SeekFrom},
    path::Path,
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use reqwest::{
    Client, StatusCode, Url,
    header::{ACCEPT, ACCEPT_ENCODING, CACHE_CONTROL, LOCATION},
    redirect::Policy,
};
use semver::Version;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

const UPDATE_MANIFEST: &str = "https://download.ruiange.work/api/v1/desktop-updates/gasoline/windows/x86_64?channel=stable&bundle_type=zip";
const DOWNLOAD_PREFIX: &str = "https://download.ruiange.work/api/v1/update-assets/";
const MAX_MANIFEST_BYTES: usize = 128 * 1024;
const MAX_INSTALLER_BYTES: u64 = 512 * 1024 * 1024;
const INVALID_RELEASE: &str = "软件中心返回的 Windows 更新清单无效。";
const INVALID_REDIRECT: &str = "软件中心返回的安装包下载地址无效。";
const INVALID_ARCHIVE: &str = "安装包格式无效，无法安全解压。";

#[derive(Default)]
pub struct UpdateState(AtomicBool);

struct UpdateGuard<'a>(&'a AtomicBool);

impl UpdateState {
    fn acquire(&self) -> Result<UpdateGuard<'_>, &'static str> {
        if self.0.swap(true, Ordering::AcqRel) {
            return Err("已有更新操作正在进行，请稍候。");
        }
        Ok(UpdateGuard(&self.0))
    }
}

impl Drop for UpdateGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    notes: String,
}

#[derive(Deserialize)]
struct ManifestResponse {
    code: u32,
    data: Option<Release>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Release {
    project_key: String,
    channel: String,
    version: String,
    notes: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Asset {
    asset_id: String,
    target: String,
    arch: String,
    bundle_type: String,
    artifact_kind: String,
    visibility: String,
    original_name: String,
    size: u64,
    sha256: String,
    download_url: String,
}

struct VerifiedRelease {
    version: Version,
    notes: String,
    asset: Asset,
}

fn stable_windows_version(version: &str) -> Result<Version, &'static str> {
    let parsed = Version::parse(version).map_err(|_| INVALID_RELEASE)?;
    if !parsed.pre.is_empty()
        || !parsed.build.is_empty()
        || [parsed.major, parsed.minor, parsed.patch]
            .iter()
            .any(|part| *part > u16::MAX.into())
    {
        return Err(INVALID_RELEASE);
    }
    Ok(parsed)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_release(release: Release) -> Result<VerifiedRelease, &'static str> {
    let version = stable_windows_version(&release.version)?;
    let [asset]: [Asset; 1] = release.assets.try_into().map_err(|_| INVALID_RELEASE)?;
    let asset_id = Uuid::parse_str(&asset.asset_id).map_err(|_| INVALID_RELEASE)?;
    if release.project_key != "gasoline"
        || release.channel != "stable"
        || release.notes.trim().is_empty()
        || release.notes.chars().count() > 20_000
        || asset.target != "windows"
        || asset.arch != "x86_64"
        || asset.bundle_type != "zip"
        || asset.artifact_kind != "desktop"
        || asset.visibility != "public"
        || asset_id.get_version_num() != 4
        || asset_id.to_string() != asset.asset_id
        || asset.download_url != format!("{DOWNLOAD_PREFIX}{asset_id}")
        || asset.original_name != format!("Gasoline-{version}-windows-x64.zip")
        || !(1..=MAX_INSTALLER_BYTES).contains(&asset.size)
        || !is_sha256(&asset.sha256)
    {
        return Err(INVALID_RELEASE);
    }
    Ok(VerifiedRelease {
        version,
        notes: release.notes,
        asset,
    })
}

fn updater_client() -> Result<Client, &'static str> {
    Client::builder()
        .redirect(Policy::none())
        .https_only(true)
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(60))
        .timeout(Duration::from_secs(900))
        .build()
        .map_err(|_| "无法初始化软件中心连接。")
}

async fn latest_release(
    client: &Client,
    current_version: &Version,
) -> Result<Option<VerifiedRelease>, &'static str> {
    const CONNECTION_ERROR: &str = "无法读取软件中心的更新信息，请检查网络后重试。";
    let mut response = client
        .get(UPDATE_MANIFEST)
        .header(ACCEPT, "application/json")
        .header(CACHE_CONTROL, "no-cache")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| CONNECTION_ERROR)?;
    if response.status() != StatusCode::OK {
        return Err(CONNECTION_ERROR);
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| CONNECTION_ERROR)? {
        if chunk.len() > MAX_MANIFEST_BYTES.saturating_sub(bytes.len()) {
            return Err(INVALID_RELEASE);
        }
        bytes.extend_from_slice(&chunk);
    }
    let manifest: ManifestResponse = serde_json::from_slice(&bytes).map_err(|_| INVALID_RELEASE)?;
    if manifest.code != 0 {
        return Err(INVALID_RELEASE);
    }
    let release = manifest.data.map(validate_release).transpose()?;
    Ok(release.filter(|release| release.version > *current_version))
}

fn r2_download_url(location: &str, file_name: &str) -> Result<Url, &'static str> {
    let url = Url::parse(location).map_err(|_| INVALID_REDIRECT)?;
    if url.scheme() != "https"
        || !url
            .host_str()
            .is_some_and(|host| host.ends_with(".r2.cloudflarestorage.com"))
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || !url.path().ends_with(&format!("-{file_name}"))
    {
        return Err(INVALID_REDIRECT);
    }
    for (name, valid) in [
        (
            "X-Amz-Algorithm",
            (|value: &str| value == "AWS4-HMAC-SHA256") as fn(&str) -> bool,
        ),
        ("X-Amz-SignedHeaders", |value| value == "host"),
        ("X-Amz-Signature", is_sha256),
    ] {
        let mut values = url
            .query_pairs()
            .filter_map(|(key, value)| (key == name).then_some(value));
        if !values.next().is_some_and(|value| valid(&value)) || values.next().is_some() {
            return Err(INVALID_REDIRECT);
        }
    }
    Ok(url)
}

async fn download_archive(client: &Client, asset: &Asset, path: &Path) -> Result<(), &'static str> {
    const DOWNLOAD_ERROR: &str = "Windows 更新下载失败，请检查网络后重试。";
    const SIZE_MISMATCH: &str = "Windows 更新文件大小与软件中心记录不一致。";
    const WRITE_ERROR: &str = "无法写入 Windows 更新文件，请检查可用磁盘空间。";

    let response = client
        .get(&asset.download_url)
        .header(ACCEPT_ENCODING, "identity")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| DOWNLOAD_ERROR)?;
    let mut response = match response.status() {
        StatusCode::OK => response,
        StatusCode::FOUND | StatusCode::TEMPORARY_REDIRECT => {
            let location = response.headers().get(LOCATION).ok_or(INVALID_REDIRECT)?;
            let target = r2_download_url(
                location.to_str().map_err(|_| INVALID_REDIRECT)?,
                &asset.original_name,
            )?;
            client
                .get(target)
                .header(ACCEPT_ENCODING, "identity")
                .send()
                .await
                .map_err(|_| DOWNLOAD_ERROR)?
        }
        _ => return Err(DOWNLOAD_ERROR),
    };
    if response.status() != StatusCode::OK {
        return Err(DOWNLOAD_ERROR);
    }
    if response
        .content_length()
        .is_some_and(|length| length != asset.size)
    {
        return Err(SIZE_MISMATCH);
    }

    let mut file = tokio::fs::File::create_new(path)
        .await
        .map_err(|_| WRITE_ERROR)?;
    let mut size = 0;
    let mut hash = Sha256::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| DOWNLOAD_ERROR)? {
        size += chunk.len() as u64;
        if size > asset.size {
            return Err(SIZE_MISMATCH);
        }
        hash.update(&chunk);
        file.write_all(&chunk).await.map_err(|_| WRITE_ERROR)?;
    }
    if size != asset.size {
        return Err(SIZE_MISMATCH);
    }
    if !format!("{:x}", hash.finalize()).eq_ignore_ascii_case(&asset.sha256) {
        return Err("Windows 更新文件未通过 SHA-256 校验。");
    }
    file.flush().await.map_err(|_| WRITE_ERROR)?;
    Ok(())
}

fn extract_installer(
    archive: &Path,
    installer: &Path,
    file_name: &str,
) -> Result<(), &'static str> {
    let archive = File::open(archive).map_err(|_| INVALID_ARCHIVE)?;
    let mut archive = zip::ZipArchive::new(archive).map_err(|_| INVALID_ARCHIVE)?;
    if archive.len() != 1 || archive.has_duplicate_names() || archive.offset() != 0 {
        return Err(INVALID_ARCHIVE);
    }
    let entry = archive.by_index(0).map_err(|_| INVALID_ARCHIVE)?;
    if entry.name().map_err(|_| INVALID_ARCHIVE)?.as_ref() != file_name
        || !entry.is_file()
        || entry
            .unix_mode()
            .is_some_and(|mode| !matches!(mode & 0o170000, 0 | 0o100000))
        || !(2..=MAX_INSTALLER_BYTES).contains(&entry.size())
    {
        return Err(INVALID_ARCHIVE);
    }

    let expected_size = entry.size();
    let mut output = OpenOptions::new()
        .create_new(true)
        .read(true)
        .write(true)
        .open(installer)
        .map_err(|_| "无法创建 Windows 安装程序文件。")?;
    let written =
        io::copy(&mut entry.take(expected_size + 1), &mut output).map_err(|_| INVALID_ARCHIVE)?;
    if written != expected_size {
        return Err(INVALID_ARCHIVE);
    }
    let mut signature = [0; 2];
    output
        .seek(SeekFrom::Start(0))
        .and_then(|_| output.read_exact(&mut signature))
        .map_err(|_| INVALID_ARCHIVE)?;
    if signature != *b"MZ" {
        return Err(INVALID_ARCHIVE);
    }
    Ok(())
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
) -> Result<Option<UpdateInfo>, &'static str> {
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Ok(None);
    }
    let _guard = state.acquire()?;
    let client = updater_client()?;
    let release = latest_release(&client, &app.package_info().version).await?;
    Ok(release.map(|release| UpdateInfo {
        version: release.version.to_string(),
        notes: release.notes,
    }))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, UpdateState>,
    version: String,
) -> Result<(), &'static str> {
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("此平台不支持安装 Windows 更新。");
    }
    let requested =
        stable_windows_version(&version).map_err(|_| "请选择有效的 Windows 更新版本。")?;
    let _guard = state.acquire()?;
    let client = updater_client()?;
    let current_version = &app.package_info().version;
    let release = latest_release(&client, current_version)
        .await?
        .filter(|release| release.version == requested)
        .ok_or("可用版本已变化，请重新检查更新后安装。")?;

    let work = tempfile::Builder::new()
        .prefix("gasoline-update-")
        .tempdir()
        .map_err(|_| "无法创建 Windows 更新临时目录。")?;
    let archive = work.path().join(&release.asset.original_name);
    download_archive(&client, &release.asset, &archive).await?;
    let file_name = format!("Gasoline_{}_x64-setup.exe", release.version);
    tauri::async_runtime::spawn_blocking(move || -> Result<(), &'static str> {
        let installer = work.path().join(&file_name);
        extract_installer(&archive, &installer, &file_name)?;
        std::fs::remove_file(archive).map_err(|_| "无法清理 Windows 更新压缩包。")?;
        Command::new(installer)
            .args(["/P", "/UPDATE", "/R"])
            .current_dir(work.path())
            .spawn()
            .map_err(|_| "无法启动 Windows 更新安装程序。")?;
        // Windows needs the installer to remain on disk after the current app exits.
        let _ = work.keep();
        Ok(())
    })
    .await
    .map_err(|_| "无法准备 Windows 更新安装程序。")??;

    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::{ZipWriter, write::SimpleFileOptions};

    #[test]
    fn release_requires_the_gasoline_windows_asset_and_stable_version() {
        let manifest = serde_json::json!({
            "projectKey": "gasoline", "channel": "stable", "version": "0.1.1", "notes": "修复问题",
            "assets": [{
                "assetId": "cc38967f-ac3c-4ba0-8419-f93b8b773314", "target": "windows", "arch": "x86_64",
                "bundleType": "zip", "artifactKind": "desktop", "visibility": "public",
                "originalName": "Gasoline-0.1.1-windows-x64.zip", "size": 10, "sha256": "a".repeat(64),
                "downloadUrl": format!("{DOWNLOAD_PREFIX}cc38967f-ac3c-4ba0-8419-f93b8b773314"),
            }],
        });
        let release = |value| serde_json::from_value(value).unwrap();
        assert!(validate_release(release(manifest.clone())).is_ok());
        for (path, value) in [
            ("/version", serde_json::json!("0.1.1-beta.1")),
            ("/assets/0/arch", serde_json::json!("aarch64")),
            (
                "/assets/0/downloadUrl",
                serde_json::json!("https://other.example/file.zip"),
            ),
            ("/assets/0/size", serde_json::json!(MAX_INSTALLER_BYTES + 1)),
        ] {
            let mut invalid = manifest.clone();
            *invalid.pointer_mut(path).unwrap() = value;
            assert!(validate_release(release(invalid)).is_err());
        }
    }

    #[test]
    fn r2_redirect_requires_the_expected_signed_https_object() {
        let file = "Gasoline-0.1.1-windows-x64.zip";
        let url = format!(
            "https://account.r2.cloudflarestorage.com/bucket/id-{file}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-SignedHeaders=host&X-Amz-Signature={}",
            "a".repeat(64)
        );
        assert!(r2_download_url(&url, file).is_ok());
        assert!(r2_download_url(&url.replace("https:", "http:"), file).is_err());
        assert!(r2_download_url(&url.replace(".com/", ".com.other.example/"), file).is_err());
        assert!(r2_download_url(&url, "another.zip").is_err());
        assert!(r2_download_url(&format!("{url}&X-Amz-SignedHeaders=host"), file).is_err());
    }

    #[test]
    fn only_the_single_expected_regular_installer_is_extracted() {
        let work = tempfile::tempdir().unwrap();
        let name = "Gasoline_0.1.1_x64-setup.exe";
        for (index, (names, valid)) in [
            (vec![name], true),
            (vec![name, "another.exe"], false),
            (vec!["../Gasoline_0.1.1_x64-setup.exe"], false),
        ]
        .into_iter()
        .enumerate()
        {
            let path = work.path().join(format!("{index}.zip"));
            let mut zip = ZipWriter::new(File::create(&path).unwrap());
            for entry in names {
                let options = SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated);
                zip.start_file(entry, options).unwrap();
                zip.write_all(b"MZtest").unwrap();
            }
            zip.finish().unwrap();
            let output = work.path().join(format!("{index}.exe"));
            assert_eq!(extract_installer(&path, &output, name).is_ok(), valid);
            if valid {
                assert_eq!(std::fs::read(output).unwrap(), b"MZtest");
            } else {
                assert!(!output.exists());
            }
        }
    }
}
