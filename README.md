# 车辆监控开发规范

## 开发环境

- 使用 Node.js 24.x、pnpm 11.5.0 和 PostgreSQL。依赖变更时同步提交 `pnpm-lock.yaml`。
- 本地配置以 `.env.example` 为模板，示例配置和测试数据使用占位值或模拟数据。数据库连接、密钥和真实业务数据保存在仓库外。
- TypeScript 与 React 代码遵循项目的 ESLint 配置，使用 `pnpm lint` 检查。

## 前端

- 使用 Next.js App Router。后台页面放在 `app/(admin)/`，可复用组件放在 `components/`。优先复用现有 Ant Design 组件和页面布局。
- 客户端请求业务接口时，复用 `lib/api-client.ts` 中的 `apiFetch` 处理响应和错误。
- 列表分页默认每页 20 条，分页组件的初始值与请求参数一致。加油台账相关列表复用 `lib/fuel.ts` 中的 `FUEL_PAGE_SIZE`。
- 支持选择的表格或列表中，点击可选行与点击复选框或单选框共用同一选中状态，遵循现有单选、多选和禁选规则。选中时高亮整行，取消选中时移除高亮。

## Windows 客户端

客户端使用 Tauri 2 和 WebView2，在本地加载与网页版共用的 React 页面、组件和静态资源。登录、会话检查和业务数据读写都使用现有线上 API。首次启动时填写现有网站的 HTTPS 根地址。客户端只保存服务器地址，完全退出进程后需要重新登录。

在 Windows 安装 Rust stable、Microsoft C++ Build Tools 和 WebView2 Runtime 后，从仓库根目录执行下列命令。开发时可以连接本机 `pnpm dev` 启动的 Web 服务，例如 `http://localhost:3000`。

```powershell
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm --dir desktop tauri dev
```

在 Windows 生成 x64 安装包可执行 `pnpm --dir desktop tauri build --target x86_64-pc-windows-msvc -- --locked`，也可手动运行 GitHub Actions 的 **Build Windows client** 并下载 `gasoline-windows-x64` 产物。填写工作流的 `api_origin` 或设置构建环境变量 `VITE_GASOLINE_API_ORIGIN` 可以预填服务器地址。

## 接口

- 路由处理器放在 `app/api/`。需要登录的业务接口复用 `lib/server-api.ts` 中的 `apiRoute`，服务端使用 Zod 校验外部输入。
- 业务 JSON 响应统一为 `{ code, data, message }`。成功时 `code` 为 `0`，失败时返回相应 HTTP 状态码和错误信息。
- 新增或修改接口时，同步更新 `lib/openapi.ts` 中的参数、响应和错误定义。登录后可在 `/docs` 查看接口文档。

## 数据库与业务计算

- Drizzle 表结构放在 `lib/db/`。变更表结构后使用 `pnpm db:generate` 生成迁移，并随代码提交 `drizzle/` 中的迁移文件及元数据。本地使用 `pnpm db:migrate` 应用迁移。
- 金额和油耗计算复用 `decimal.js` 及现有业务函数。业务日期按业务时区计算，复用 `lib/fuel-calendar.ts`。
- 台账写入涉及关联记录或派生数据时，沿用现有事务和重算逻辑。
