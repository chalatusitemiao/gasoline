# 车辆监控开发规范

## 多公司使用

系统采用共享应用、共享数据库、按公司隔离业务数据的多租户模式。全平台只有一名超级管理员，负责公司、公司账号、平台设置和公司级汇总；公司管理员、录入员和只读人员按原有角色权限使用本公司台账。

- 原来使用注册密钥初始化的固定账号升级为 `super_admin`，不归属公司，也不自动取得公司业务权限。现有其他账号及历史业务数据迁入“默认公司”。默认公司若没有有效公司管理员，超级管理员需在账号管理中补建。
- 账号只能归属一家公司，用户名保持全平台唯一；公司管理员只能管理本公司账号。车辆、司机、台账、导入导出、报表及业务日志均限定当前公司。公司停用后其账号不能继续使用系统，历史数据保留。
- 平台设置仅包含站点地址 `authUrl`；业务时区、油耗基线样本数和异常倍数按公司独立维护。司机允许同公司同名，导入遇到同名歧义时返回对应行的错误。
- 完整权限边界、接口契约和升级步骤见 [多公司租户说明](docs/multi-company.md)，产品使用范围见 [PRODUCT.md](PRODUCT.md)。

## 开发环境

- 使用 Node.js 24.x、pnpm 11.5.0 和 PostgreSQL。依赖变更时同步提交 `pnpm-lock.yaml`。
- 本地配置以 `.env.example` 为模板，示例配置和测试数据使用占位值或模拟数据。数据库连接、密钥和真实业务数据保存在仓库外。
- TypeScript 与 React 代码遵循项目的 ESLint 配置，使用 `pnpm lint` 检查。

## Windows 客户端

客户端使用 Tauri 2 和 WebView2，在本地加载与网页版共用的 React 页面、组件和静态资源。登录、会话检查和业务数据读写都使用现有线上 API。首次启动时填写现有网站的 HTTPS 根地址。客户端只保存服务器地址，完全退出进程后需要重新登录。

从 `0.1.2` 起，登录 Windows 客户端后可在右上角账号菜单选择「检查更新」。发现新版本时，客户端显示版本号和更新说明。点击「下载并安装」后，客户端从软件中心下载安装包，校验文件大小和 SHA-256，再启动安装程序并退出。从 `0.1.0` 升级时，请先从软件中心下载并安装 `0.1.2` 或更高版本。

在 Windows 安装 Rust stable、Microsoft C++ Build Tools 和 WebView2 Runtime 后，从仓库根目录执行下列命令。开发时可以连接本机 `pnpm dev` 启动的 Web 服务，例如 `http://localhost:3000`。

```powershell
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm --dir desktop tauri dev
```

在 Windows 生成 x64 安装包可执行 `pnpm --dir desktop tauri build --target x86_64-pc-windows-msvc -- --locked`，也可手动运行 GitHub Actions 的 **Build Windows client** 并下载 `gasoline-windows-x64` 产物。填写工作流的 `api_origin` 或设置构建环境变量 `VITE_GASOLINE_API_ORIGIN` 可以预填服务器地址。

### 通过 CNB 发布到软件中心

CNB 的 Windows x64 发布只响应 Git `tag_push` 事件。推送 `v主版本.次版本.修订版本` 格式的 tag 后，流水线去掉 `v` 前缀，把得到的版本号写入 Tauri 客户端、NSIS 安装包和软件中心发布记录。例如，`v0.1.2` 对应版本 `0.1.2`。附注 tag 的标题会作为更新说明。CNB 将安装程序打包为 `Gasoline-<version>-windows-x64.zip`，通过短效地址直传 R2，再请求软件中心核验 SHA-256、发布并读回公开版本。

CNB 将 Windows SDK 与构建工具、Cargo 依赖分别保存为缓存镜像，供不同 tag 和构建节点使用。修改 Cargo 依赖清单时只重建依赖缓存，Windows SDK 继续复用。Windows 构建使用离线 Cargo 模式，首次建立缓存时会下载工具链和依赖。

首次发布前，软件中心需部署接受 `gasoline/windows/x86_64/zip` 的版本。CNB 的上传阶段从 `ruiange/gasoline-keys` 仓库的 `main/env.yml` 导入 `UPDATE_UPLOAD_TOKEN`。在该密钥文件中填入软件中心提供的上传令牌，并限定引用范围。

```yaml
allow_slugs: ruiange/gasoline
allow_events: tag_push
allow_branches: 'v*'
UPDATE_UPLOAD_TOKEN: '<软件中心上传令牌>'
```

在本地将 `https://cnb.cool/ruiange/gasoline.git` 配置为 `cnb` 远端。先同步要发布的提交，再创建并推送递增的 tag。以发布 `v0.1.3` 为例。每个已发布版本的安装包不可覆盖。若完成上传时响应中断，按流水线日志中的会话 ID 在软件中心核对结果。

```sh
git push cnb HEAD:refs/heads/main
git tag -a v0.1.3 -m '本次更新说明'
git push cnb refs/tags/v0.1.3
```

## 接口

- 路由处理器放在 `app/api/`。需要登录的业务接口复用 `lib/server-api.ts` 中的 `apiRoute`，服务端使用 Zod 校验外部输入。
- 业务 JSON 响应统一为 `{ code, data, message }`。成功时 `code` 为 `0`，失败时返回相应 HTTP 状态码和错误信息。
- 新增或修改接口时，同步更新 `lib/openapi.ts` 中的 Swagger/OpenAPI 参数、响应和错误定义。登录后可在 `/docs` 通过现有 Scalar UI 查看接口文档；原始文档为 `/api/openapi`。

## 数据库与业务计算

- Drizzle 表结构放在 `lib/db/`。变更表结构后使用 `pnpm db:generate` 生成迁移，并随代码提交 `drizzle/` 中的迁移文件及元数据。本地使用 `pnpm db:migrate` 应用迁移。
- `pnpm dev` 和 `pnpm start` 均先执行 `pnpm db:migrate`，迁移或旧配置承接失败时不得继续启动 Web 服务。升级多公司版本前先备份数据库；`drizzle/0006_gorgeous_taskmaster.sql` 会创建默认公司、回填已有账号及业务数据并清除旧会话。迁移流程中的 `lib/db/company-bootstrap.mjs` 仅在 `legacy_initialized=false` 时复制旧加密业务配置，后续不会覆盖人工配置；具体步骤见多公司租户说明。
- 金额和油耗计算复用 `decimal.js` 及现有业务函数。业务日期按业务时区计算，复用 `lib/fuel-calendar.ts`。
- 台账写入涉及关联记录或派生数据时，沿用现有事务和重算逻辑。

本次多公司改造的数据库迁移尚未应用，构建、类型检查、测试、服务启动及运行时验证均未执行；文档中的升级与验收步骤用于后续部署执行。
