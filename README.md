# 油量监控

油量监控提供车队加油台账、异常核查和油耗分析。首页是经营看板，侧栏包含录入加油、加油记录、单车月报、司机考核、成本表、车辆档案、司机档案和数据导入。

## 本地启动

使用 Node.js 24、pnpm 11 和 PostgreSQL。先创建空数据库，然后在项目根目录执行。

```sh
pnpm install
cp .env.example .env.local
openssl rand -base64 32
```

将随机字符串填入 `BETTER_AUTH_SECRET`，填写数据库连接和后台账号密码。

```sh
pnpm db:migrate
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 并使用配置的账号登录。已有数据库运行同一迁移命令即可应用新增迁移。修改 Drizzle 表结构后，可用 `pnpm db:generate` 生成后续迁移。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 应用的 PostgreSQL 连接串。Vercel 上可填写服务商的连接池地址。 |
| `DATABASE_URL_UNPOOLED` | 可选的迁移专用直连地址。省略时使用 `DATABASE_URL`。 |
| `BETTER_AUTH_URL` | 实际访问的源地址。本地默认 `http://localhost:3000`，Vercel 使用当前环境的 HTTPS 域名。 |
| `BETTER_AUTH_SECRET` | 至少 32 个字符的随机密钥，每个环境独立设置。 |
| `FUEL_LOGIN_USERNAME`、`FUEL_LOGIN_PASSWORD` | 唯一的后台登录凭据，只在服务端使用。 |
| `FUEL_TIME_ZONE` | 用于业务日期、当前月和删除日志保留期限，默认 `Asia/Shanghai`。 |
| `FUEL_BASELINE_SAMPLES`、`FUEL_ANOMALY_MULTIPLIER` | 油耗基线的取样条数与异常倍数，默认 `5` 和 `1.3`。配置变更在下一次写入并重算相关车辆时生效。 |

## 台账口径

- 加油日期精确到天。同一辆车按加油日期及同日录入顺序计算区间。首条记录没有区间里程。区间里程不增长时标记「里程未增」，油耗留空。
- 有至少两个历史有效区间后才判断油耗异常。基线采用最近有效样本的算术平均，已经标为油耗异常的区间不进入后续基线。修改、删除和导入会重算相关车辆的完整记录链。
- 单笔区间油耗以每次加满油箱为口径。部分加油会使单笔结果失真。连续、完整的加油记录做月度或年度汇总时，累计偏差取决于期初与期末的油箱余量差，最多一箱油。
- 区间报表按本次加油日期归属月份，合计百公里油耗为正区间记录的油量合计除以对应里程再乘 100。标为油耗异常的正里程区间仍可在报表中观察。加油总量和油费保留每一笔实付记录。
- 手工录单以油量乘单价并四舍五入到分。台账导入保留文件金额并反算单价。编辑导入记录时，原油量和原单价都未改变则保留文件金额。
- 删除台账时先在同一事务保存快照，再删除原记录及其修改留痕并重算。删除日志查询和删除操作会清理超过 12 个月的快照。

## 导入与导出

车辆档案可粘贴车牌或上传 XLSX、CSV，只读取选定的车牌列。数据导入页提供台账模板、列映射、前 6 行预览和错行原因。文件缺少对应档案时自动创建，新增车辆可指定默认油品。大文件分批提交，页面显示已完成进度。加油记录、单车月报、司机考核和成本表都可导出 Excel。

## 接口与部署

登录后访问 `/docs` 使用 Scalar 查看和调试业务接口。OpenAPI JSON 位于 `/api/openapi`。业务响应统一使用 `{code,data,message}`，成功时 `code` 为 `0`。会话 12 小时固定有效，连续 5 次凭据错误锁定 5 分钟。

Vercel 使用 Next.js 框架预设。部署前用 `pnpm install` 更新锁文件并提交，按目标环境配置上表变量和 `ENABLE_EXPERIMENTAL_COREPACK=1`。对目标数据库执行 `pnpm db:migrate` 后再接入流量。构建使用 `pnpm build`。

[Vercel 的 Next.js 部署文档](https://vercel.com/docs/frameworks/full-stack/nextjs) · [Vercel 的包管理器配置](https://vercel.com/docs/package-managers)
