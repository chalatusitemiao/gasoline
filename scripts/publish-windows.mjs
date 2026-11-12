import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const projectKey = "gasoline";
const channel = "stable";
const releasesPath = `/internal/v1/projects/${projectKey}/releases`;
const publicPath = `/api/v1/desktop-updates/${projectKey}/windows/x86_64?channel=${channel}&bundle_type=zip`;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const maxBytes = 512 * 1024 * 1024;

async function readArtifact(manifestPath) {
  const { version, buildNumber, notes, filename } = JSON.parse(await readFile(manifestPath, "utf8"));
  if (typeof version !== "string" || !stableVersion.test(version) ||
      !Number.isSafeInteger(buildNumber) || buildNumber < 1 || typeof notes !== "string" ||
      !notes.trim() || notes.length > 20_000 || filename !== `Gasoline-${version}-windows-x64.zip`) {
    throw new Error("Windows 发布清单无效");
  }

  const path = join(dirname(manifestPath), filename);
  const file = await lstat(path);
  if (!file.isFile() || file.size < 1 || file.size > maxBytes) {
    throw new Error("Windows 安装包必须是 512 MiB 以内的非空 ZIP 文件");
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { version, buildNumber, notes: notes.trim(), filename, path, size: file.size, sha256: hash.digest("hex") };
}

function compareVersions(left, right) {
  const parts = right.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/);
  if (!parts) throw new Error("软件中心返回了无效的版本号");
  const leftParts = left.split(".").map(Number);
  const rightParts = parts.slice(1, 4).map(Number);
  return leftParts[0] - rightParts[0] || leftParts[1] - rightParts[1] ||
    leftParts[2] - rightParts[2] || (parts[4] ? 1 : 0);
}

function matchRelease(release, artifact) {
  return release?.projectKey === projectKey && release.version === artifact.version && release.channel === channel &&
    release.buildNumber === artifact.buildNumber && release.notes === artifact.notes && Array.isArray(release.assets);
}

function windowsAsset(release) {
  return release.assets.find((asset) => asset.target === "windows" && asset.arch === "x86_64" && asset.bundleType === "zip");
}

function matchAsset(asset, artifact) {
  return asset?.artifactKind === "desktop" && asset.visibility === "public" && asset.originalName === artifact.filename &&
    asset.size === artifact.size && asset.sha256 === artifact.sha256 && typeof asset.assetId === "string" && Boolean(asset.assetId);
}

function directUploadTarget(session, size) {
  const { uploadId, uploadUrl, headers: signedHeaders, expiresAt } = session ?? {};
  if (typeof uploadId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(uploadId)) {
    throw new Error("软件中心返回了无效的直传会话 ID");
  }

  let url;
  try {
    url = new URL(uploadUrl);
  } catch {
    throw new Error(`直传会话 ${uploadId} 的 R2 地址无效`);
  }
  const expiry = Date.parse(expiresAt);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".r2.cloudflarestorage.com") || url.port ||
      url.username || url.password || url.hash || url.pathname === "/" ||
      url.searchParams.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256" ||
      !/^[a-f0-9]{64}$/i.test(url.searchParams.get("X-Amz-Signature") ?? "") ||
      url.searchParams.get("X-Amz-SignedHeaders") !== "content-length;content-type;host" ||
      !Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error(`直传会话 ${uploadId} 的 R2 签名或有效期无效`);
  }

  const headerEntries = Object.entries(signedHeaders ?? {}).map(([key, value]) => [key.toLowerCase(), value]);
  const headers = Object.fromEntries(headerEntries);
  if (headerEntries.length !== 2 || headers["content-type"] !== "application/zip" || headers["content-length"] !== String(size)) {
    throw new Error(`直传会话 ${uploadId} 的文件类型或长度与 ZIP 不一致`);
  }
  return { uploadId, url, headers };
}

function appDownloadApi(baseUrl, token) {
  return async (label, path, { payload, publicRequest = false } = {}) => {
    const headers = { Accept: "application/json" };
    if (!publicRequest) headers.Authorization = `Bearer ${token}`;
    if (payload !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        method: payload === undefined ? "GET" : "POST",
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(payload === undefined ? 30_000 : 180_000),
      });
    } catch {
      throw new Error(`${label}未获得软件中心响应`);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.code !== 0 || !("data" in result)) {
      const message = typeof result?.message === "string" && !/https?:|bearer|X-Amz-/i.test(result.message)
        ? `：${result.message.slice(0, 200)}` : "";
      throw new Error(`${label}失败（HTTP ${response.status}）${message}`);
    }
    return result.data;
  };
}

async function putToR2(target, path) {
  const stream = createReadStream(path);
  try {
    const response = await fetch(target.url, {
      method: "PUT",
      headers: target.headers,
      body: stream,
      duplex: "half",
      redirect: "error",
      signal: AbortSignal.timeout(600_000),
    });
    await response.body?.cancel();
    if (response.ok) return;
  } catch {
    // The request may have reached R2 before the connection failed.
  } finally {
    stream.destroy();
  }
  throw new Error(`R2 直传未获成功确认，请核对会话 ${target.uploadId}`);
}

async function publish(manifestPath) {
  if (!manifestPath) throw new Error("用法：node scripts/publish-windows.mjs artifacts/windows/release.json");
  const token = process.env.UPDATE_UPLOAD_TOKEN?.trim();
  if (!token) throw new Error("缺少软件中心上传凭据 UPDATE_UPLOAD_TOKEN");
  const baseUrl = new URL(process.env.APPDOWNLOAD_BASE_URL || "https://download.ruiange.work");
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new Error("APPDOWNLOAD_BASE_URL 必须是软件中心的 HTTPS 根地址");
  }

  const artifact = await readArtifact(manifestPath);
  const api = appDownloadApi(baseUrl, token);
  const latest = await api("查询公开 Windows 版本", publicPath, { publicRequest: true });
  if (latest && (typeof latest.version !== "string" || compareVersions(artifact.version, latest.version) < 0)) {
    throw new Error("目标版本低于当前公开 Windows 版本或版本响应无效");
  }
  const releases = await api("查询软件中心版本", `${releasesPath}?channel=${channel}`);
  if (!Array.isArray(releases)) throw new Error("软件中心版本列表无效");
  const existing = releases.find((release) => release.version === artifact.version);
  if (existing && (!matchRelease(existing, artifact) || !["pending", "published"].includes(existing.status))) {
    throw new Error("目标版本的构建号、更新说明或发布状态与本次构建不一致");
  }
  const existingAsset = existing && windowsAsset(existing);
  if (existingAsset && !matchAsset(existingAsset, artifact)) throw new Error("该版本已有不同的 Windows 制品");

  let release = existing;
  if (!existingAsset || existing.status !== "published") {
    const session = await api("申请 R2 直传", `${releasesPath}/${artifact.version}/platforms/windows/x86_64/direct-uploads?bundleType=zip`, {
      payload: {
        channel,
        projectName: "车辆监控",
        notes: artifact.notes,
        buildNumber: artifact.buildNumber,
        artifactKind: "desktop",
        visibility: "public",
        originalName: artifact.filename,
        size: artifact.size,
        sha256: artifact.sha256,
      },
    });
    const target = directUploadTarget(session, artifact.size);
    await putToR2(target, artifact.path);
    const sessionPath = `/internal/v1/direct-uploads/${target.uploadId}`;
    try {
      release = await api("完成 R2 直传", `${sessionPath}/complete`, { payload: {} });
    } catch (error) {
      const status = await api("核对 R2 直传会话", sessionPath).catch(() => null);
      if (status?.status !== "completed" || !status.release) {
        throw new Error(`${error.message}，请核对会话 ${target.uploadId}`);
      }
      release = status.release;
    }
  }

  if (!matchRelease(release, artifact) || release.status !== "published" || !matchAsset(windowsAsset(release), artifact)) {
    throw new Error("软件中心的发布记录与本地 ZIP 不一致");
  }
  const published = await api("核对公开 Windows 版本", publicPath, { publicRequest: true });
  const asset = matchRelease(published, artifact) && windowsAsset(published);
  if (!matchAsset(asset, artifact) || asset.assetId !== windowsAsset(release).assetId ||
      asset.downloadUrl !== new URL(`/api/v1/update-assets/${encodeURIComponent(asset.assetId)}`, baseUrl).href) {
    throw new Error("公开 Windows 版本与已发布的安装包不一致");
  }
  console.log(`软件中心已公开发布 ${artifact.filename}\n${asset.downloadUrl}`);
}

publish(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
