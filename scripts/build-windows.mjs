import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const target = "x86_64-pc-windows-msvc";
const targetDir = join(workspace, "desktop/src-tauri/target");
const releaseDir = join(workspace, "artifacts/windows");

function readVersion(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag ?? "");
  if (!match) throw new Error("Windows 发布标签必须使用 vX.Y.Z 格式，例如 v0.1.0。");

  const [major, minor, patch] = match.slice(1).map(Number);
  const windowsVersionBase = 65_536;
  if (major >= windowsVersionBase || minor >= windowsVersionBase || patch >= windowsVersionBase) {
    throw new Error("Windows 安装包版本号的每一段最多为 65535。");
  }

  return { version: tag.slice(1), buildNumber: (major * windowsVersionBase + minor) * windowsVersionBase + patch + 1 };
}

function tagTitle(tag) {
  const { stdout } = spawnSync("git", [
    "-c", `safe.directory=${workspace}`,
    "for-each-ref", "--format=%(objecttype)%00%(contents:subject)", `refs/tags/${tag}`,
  ], { cwd: workspace, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const [kind, subject] = (stdout ?? "").split("\0");
  if (kind === "tag" && subject?.trim()) return subject.trim();

  const cnbTitle = process.env.CNB_TAG_MESSAGE?.trim().split(/\r?\n/, 1)[0].trim();
  return cnbTitle || `发布 Gasoline Windows ${tag}`;
}

function buildInstaller(version) {
  execFileSync("pnpm", [
    "--dir", "desktop", "tauri", "build", "--ci", "--runner", "cargo-xwin", "--target", target,
    "--bundles", "nsis", "--config", JSON.stringify({ version }), "--", "--locked",
  ], {
    cwd: workspace,
    env: { ...process.env, CARGO_TARGET_DIR: targetDir },
    stdio: "inherit",
  });

  const bundleDir = join(targetDir, target, "release/bundle/nsis");
  const expected = `Gasoline_${version}_x64-setup.exe`;
  const installer = readdirSync(bundleDir, { withFileTypes: true })
    .find((entry) => entry.isFile() && entry.name === expected);
  if (!installer) throw new Error(`找不到本次构建的 NSIS 安装包 ${expected}。`);
  return join(bundleDir, installer.name);
}

function packageInstaller(installer, release) {
  mkdirSync(releaseDir, { recursive: true });
  const temporaryDir = mkdtempSync(join(releaseDir, ".package-"));
  const temporaryZip = join(temporaryDir, release.filename);
  const temporaryMetadata = join(temporaryDir, "release.json");
  try {
    execFileSync("zip", ["-j", "-X", temporaryZip, installer], { stdio: "inherit" });
    writeFileSync(temporaryMetadata, `${JSON.stringify(release, null, 2)}\n`);
    renameSync(temporaryZip, join(releaseDir, release.filename));
    renameSync(temporaryMetadata, join(releaseDir, "release.json"));
  } finally {
    rmSync(temporaryDir, { recursive: true, force: true });
  }
}

try {
  const [mode, ...extra] = process.argv.slice(2);
  if ((mode && mode !== "--check-tag") || extra.length) throw new Error("仅支持可选参数 --check-tag。");
  const tag = process.env.CNB_BRANCH;
  const { version, buildNumber } = readVersion(tag);
  console.log(`Windows 发布版本 ${version}，构建号 ${buildNumber}。`);

  if (mode !== "--check-tag") {
    const notes = tagTitle(tag);
    if (notes.length > 20_000) throw new Error("软件中心更新说明最多为 20000 个字符。");
    const filename = `Gasoline-${version}-windows-x64.zip`;
    packageInstaller(buildInstaller(version), { version, buildNumber, notes, filename });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
