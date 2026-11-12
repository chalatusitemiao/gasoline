# 车辆监控开发规范

## 开发环境

- 使用 Node.js 24.x、pnpm 11.5.0 和 PostgreSQL。依赖变更时同步提交 `pnpm-lock.yaml`。
- 本地配置以 `.env.example` 为模板，示例配置和测试数据使用占位值或模拟数据。数据库连接、密钥和真实业务数据保存在仓库外。
- TypeScript 与 React 代码遵循项目的 ESLint 配置，使用 `pnpm lint` 检查。

## Windows 客户端

客户端使用 Tauri 2 和 WebView2，在本地加载与网页版共用的 React 页面、组件和静态资源。登录、会话检查和业务数据读写都使用现有线上 API。首次启动时填写现有网站的 HTTPS 根地址。客户端只保存服务器地址，完全退出进程后需要重新登录。

在 Windows 安装 Rust stable、Microsoft C++ Build Tools 和 WebView2 Runtime 后，从仓库根目录执行下列命令。开发时可以连接本机 `pnpm dev` 启动的 Web 服务，例如 `http://localhost:3000`。

```powershell
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm --dir desktop tauri dev
```

在 Windows 生成 x64 安装包可执行 `pnpm --dir desktop tauri build --target x86_64-pc-windows-msvc -- --locked`，也可手动运行 GitHub Actions 的 **Build Windows client** 并下载 `gasoline-windows-x64` 产物。填写工作流的 `api_origin` 或设置构建环境变量 `VITE_GASOLINE_API_ORIGIN` 可以预填服务器地址。

### 通过 CNB 发布到软件中心

推送 `v主版本.次版本.修订版本` 格式的 tag 到 `cnb` 远端会触发 Windows x64 发布。流水线把 tag 的版本写入 Tauri 安装包，使用附注 tag 的标题作为更新说明。CNB 交叉构建 NSIS 安装程序并打包为 `Gasoline-<version>-windows-x64.zip`。流水线向软件中心申请短效 R2 上传地址，直接把 ZIP PUT 到 R2，再请求软件中心核验 SHA-256、发布并读回公开版本。

首次发布前，软件中心需部署接受 `gasoline/windows/x86_64/zip` 的版本。CNB 的上传阶段从 `ruiange/gasoline-keys` 仓库的 `main/env.yml` 导入 `UPDATE_UPLOAD_TOKEN`。在该密钥文件中填入软件中心提供的上传令牌，并限定引用范围。

```yaml
allow_slugs: ruiange/gasoline
allow_events: tag_push
allow_branches: 'v*'
UPDATE_UPLOAD_TOKEN: '<软件中心上传令牌>'
```

把包含流水线的提交同步到 CNB 后，在该提交上打 tag 并推送。每个已发布版本的安装包不可覆盖。若完成上传时响应中断，按流水线日志中的会话 ID 在软件中心核对结果。

```sh
git tag -a v0.1.0 -m 'Windows 客户端首发'
git push cnb refs/tags/v0.1.0
```

## 接口

- 路由处理器放在 `app/api/`。需要登录的业务接口复用 `lib/server-api.ts` 中的 `apiRoute`，服务端使用 Zod 校验外部输入。
- 业务 JSON 响应统一为 `{ code, data, message }`。成功时 `code` 为 `0`，失败时返回相应 HTTP 状态码和错误信息。
- 新增或修改接口时，同步更新 `lib/openapi.ts` 中的参数、响应和错误定义。登录后可在 `/docs` 查看接口文档。

## 数据库与业务计算

- Drizzle 表结构放在 `lib/db/`。变更表结构后使用 `pnpm db:generate` 生成迁移，并随代码提交 `drizzle/` 中的迁移文件及元数据。本地使用 `pnpm db:migrate` 应用迁移。
- 金额和油耗计算复用 `decimal.js` 及现有业务函数。业务日期按业务时区计算，复用 `lib/fuel-calendar.ts`。
- 台账写入涉及关联记录或派生数据时，沿用现有事务和重算逻辑。
