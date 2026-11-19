# 多公司租户说明

本文记录多公司改造的产品规则、接口契约和部署操作。系统使用一套应用和数据库，通过公司归属隔离各公司业务。

## 角色与权限

| 角色 | 公司归属 | 权限范围 |
| --- | --- | --- |
| `super_admin` 超级管理员 | 无 | 公司管理、收款续费、公司账号管理、平台公司级汇总、平台站点地址、接口文档 |
| `admin` 公司管理员 | 一家公司 | 原有管理员业务权限，限定本公司；管理本公司账号与业务配置 |
| `operator` 录入员 | 一家公司 | 原有录入员业务权限，限定本公司；修改记录仍遵循仅修改本人录入记录的规则 |
| `viewer` 只读人员 | 一家公司 | 原有只读业务权限，限定本公司 |

超级管理员只拥有 `companies:manage`、`users:manage`、`platform:view`、`platform:settings`、`docs:view`，不继承公司管理员的业务权限。平台汇总提供公司级统计，不提供进入某家公司录单或读取台账明细的能力。

全平台只能存在一个超级管理员。使用注册密钥进行首次初始化时建立该账号，初始化完成后关闭这条注册入口。普通账号管理不能新增、升级、降级、停用或删除超级管理员。超级管理员可以从右上角账号菜单修改本人的登录用户名和密码。

公司账号只能归属一家公司，用户名在全平台唯一。公司管理员只能管理本公司账号，不能创建超级管理员或将账号迁到其他公司。每家公司应保留至少一名有效管理员，不允许通过普通账号管理停用或降级最后一名有效管理员。

## 公司管理

超级管理员创建公司时同时设置首个公司管理员，创建公司与账号在同一事务内完成。公司包含服务端生成的唯一编号、名称、联系人、联系电话、备注及启停状态。

公司列表展示账号数量 `accountCount` 和有效管理员数量 `adminCount`。`adminCount=0` 时应提示补建公司管理员。历史迁移可能产生这种情况，系统不能擅自复用超级管理员或未知密码创建公司业务身份。

公司支持修改资料、停用和重新启用。停用后其账号不能继续访问系统，已有会话也不能继续访问公司数据；重新启用公司不改变账号各自的启停状态。首期不提供物理删除公司或公司间迁移账号、档案、台账的功能。

## 线下收款与租期

超级管理员在「公司管理」为指定公司登记实收人民币金额和续费月数。登记与租期更新一同保存，续费记录包含金额、购买月数、租期起止时间、登记时间和登记人，并写入公司操作审计。

租期为 `active` 时，续费接在当前到期时间之后。首次开通或已到期时，从登记时刻起算。日期按 `Asia/Shanghai` 的自然月计算，目标月份没有对应的日期时取该月最后一天。

新公司待首次付款（`pending`），历史公司升级后暂未纳入计费（`unmanaged`），首次登记收款后进入有效租期。

超级管理员可在「公司管理」编辑公司的「到期处理」。默认选择「到期停用」，到期后服务端会拦截 Web 和 Windows 的登录及业务请求。选择「到期不停用」时，处于启用状态的公司及账号可以继续使用，租期仍显示「已到期」（`expired`），并保留原到期时间。两种方式均保留历史数据。公司或账号若被手动停用，需重新启用后才能恢复访问。

## 数据与配置隔离

以下数据归属公司：账号、车辆、司机、加油记录、修改记录、删除快照、公司业务配置。导入、导出、选项、搜索、详情、合计、最近记录、异常提醒、司机报表及车辆报表均限制为本公司数据。

服务端从当前有效会话取得公司 ID。业务接口不能通过提交 `companyId`、其他公司的记录 ID 或其他公司的车辆/司机 ID 来切换数据范围。加油记录、关联车辆和司机必须属于同一家公司；记录删除后仍需通过删除日志自身的公司归属限制访问。

车辆车牌在公司内唯一，不同公司可维护相同车牌的独立档案。同公司允许同名司机，录单和编辑通过司机 ID 区分。导入只匹配本公司司机姓名与车牌；本公司存在多个规范化后同名司机时，跳过歧义行并返回原文件行号和错误，不能任意选择一个司机，也不能复用其他公司的档案。

平台与公司配置分离：

- 平台级：`authUrl`，仅超级管理员维护。
- 公司级：`timeZone`、`baselineSamples`、`anomalyMultiplier`，仅本公司管理员维护。
- 公司配置保存必须携带读取时得到的 `revision`；修订号不一致返回 `409`，防止覆盖其他人的修改。
- 可选 `recalculate=true` 按新参数重算本公司历史油耗与异常结果，不影响其他公司。公司配置保存返回 `requireLogin=false`。
- 台账新增、修改、删除及导入取得写锁后，在同一事务中读取公司业务参数和校验日期，与配置修改及重算串行执行，避免等待写锁的请求用旧参数覆盖新结果。

管理操作写入公司操作审计，记录操作者、动作、目标、所属公司和时间；密码及密码哈希不能进入审计详情。

## API 契约

所有 JSON 响应统一为 `{code, data, message}`。成功时 `code=0`；失败时以相应 HTTP 状态码及错误信息返回。接口使用现有 HttpOnly 会话 Cookie。Swagger/OpenAPI 定义位于 `lib/openapi.ts`，继续由 `/docs` 的现有 Scalar UI 展示，原始定义位于 `/api/openapi`。

### 当前账号与密码

- 公司账号凭据正确时，首次租期尚未开通，或租期已到期且设置为「到期停用」，`POST /api/login` 返回 `403` 并提示联系平台管理员。已有会话在这些条件下访问业务接口会返回 `401`。
- `GET /api/me`：返回当前账号、角色、权限、业务时区及 `companyId`、`companyName`。超级管理员的公司字段为 `null`。
- `PUT /api/users/password`：提交 `{currentPassword, password}`，校验当前密码后修改本人密码并撤销本人会话，返回 `data: {requireLogin: true}`，需要重新登录。
- 超级管理员通过右上角「修改登录账号」提交 `PUT /api/users/username`，请求体为 `{username, currentPassword}`。新用户名去除首尾空白后为 1 至 128 个字符，按 NFKC 规范化并忽略大小写比较。当前密码错误或新旧用户名规范化后相同返回 `400`，用户名已被占用返回 `409`，公司账号调用返回 `403`。成功返回 `data: {requireLogin: true}` 并撤销超级管理员的所有会话，随后用新用户名和当前密码登录同一超级管理员账号。

### 公司

- `GET /api/companies?keyword=&page=&pageSize=` 仅超级管理员可用，返回分页 `{items, total, page, pageSize}`。公司字段为 `id`、`code`、`name`、`contactName`、`contactPhone`、`notes`、`isActive`、`suspendOnExpiry`、`billingStatus`、`paidUntil`、`createdAt`、`updatedAt`、`accountCount`、`adminCount`。`isActive` 为手动启停状态。`suspendOnExpiry` 为布尔值，`true` 表示到期停用，`false` 表示到期不停用。`paidUntil` 为 ISO 8601 截止时间或 `null`。
- `POST /api/companies` 仅超级管理员可用。提交 `{name, contactName?, contactPhone?, notes?, adminUsername, adminPassword}` 同时创建公司和首个管理员，返回公司。新公司默认 `suspendOnExpiry=true`。
- `PUT /api/companies/{id}` 仅超级管理员可用。提交 `{name, contactName?, contactPhone?, notes?, isActive?, suspendOnExpiry?}`，返回修改后的公司。省略 `isActive` 或 `suspendOnExpiry` 时沿用对应设置。
- `GET /api/companies/audit?companyId=&page=&pageSize=`：仅超级管理员；按公司可选筛选操作审计，返回分页。审计字段为 `id`、`companyId`（可为空）、`actorId`、`actorName`、`action`、`targetId`、`details`、`createdAt`。

### 收款续费

- `GET /api/companies/{id}/renewals?page=&pageSize=` 由超级管理员查询指定公司的续费记录，按登记时间倒序返回 `{items, total, page, pageSize}`。
- `POST /api/companies/{id}/renewals` 由超级管理员提交 `{requestId, amount, months}` 登记收款。`requestId` 为唯一 UUID，`amount` 为大于等于 `0.01`、小于等于 `9999999999.99` 的人民币十进制字符串，最多两位小数，`months` 为 1 至 120 的整数。成功返回 HTTP `201`。
- 记录字段为 `id`、`amount`、`months`、`startsAt`、`endsAt`、`recordedAt`、`recordedBy`。`id` 为登记时提交的 `requestId`，`amount` 统一以两位小数返回，时间采用 ISO 8601，`recordedBy` 为登记人的显示名称。
- 用相同 `requestId` 重试同一家公司、同一金额和月数时返回原记录。使用该编号提交其他公司或不同金额、月数时返回 `409`。

### 账号

- `GET /api/users?companyId=`：返回账号数组，账号增加 `companyId`、`companyName`。超级管理员可跨公司查询和筛选，公司管理员只能查询本公司。
- `POST /api/users`：提交 `{username, password, role, companyId?}`。超级管理员必须指定 `companyId`；公司管理员的公司由会话确定。`role` 只能是 `admin`、`operator`、`viewer`。
- `PUT /api/users/{id}`：提交 `{role, isActive, password?}`，维护有权限的公司账号。不能修改公司归属，不能将账号升级为超级管理员，不得停用或降级最后一名有效公司管理员。

### 平台汇总

`GET /api/platform/summary?from=&to=&companyId=` 仅超级管理员可用。`from`、`to` 为可选的 `YYYY-MM-DD` 日期边界，`companyId` 可选。响应 `data` 为：

```json
{
  "from": null,
  "to": null,
  "items": [
    {
      "companyId": "公司 UUID",
      "companyCode": "公司编号",
      "companyName": "公司名称",
      "isActive": true,
      "accountCount": 0,
      "vehicleCount": 0,
      "driverCount": 0,
      "recordCount": 0,
      "totalLiters": "0",
      "totalAmount": "0",
      "anomalyCount": 0
    }
  ],
  "total": {
    "companyCount": 1,
    "accountCount": 0,
    "vehicleCount": 0,
    "driverCount": 0,
    "recordCount": 0,
    "totalLiters": "0",
    "totalAmount": "0",
    "anomalyCount": 0
  }
}
```

汇总包含启用与停用公司。日期条件只影响 `recordCount`、`totalLiters`、`totalAmount`、`anomalyCount`；`accountCount`、`vehicleCount`、`driverCount` 为公司当前总量，不随台账日期筛选改变。油量与金额以十进制字符串返回，避免浮点累计误差。该汇总接口不授予公司明细业务权限。

### 配置

`GET /api/settings` 按登录身份返回配置范围：超级管理员为 `scope=platform`，包含 `authUrl`、`username`、兼容桌面客户端所需的平台时区 `timeZone`（默认 `Asia/Shanghai`）；该兼容字段不表示超级管理员可修改公司业务参数。公司账号为 `scope=company`，包含 `companyId`、`companyName`、`username`、业务时区。公司管理员另获得业务配置、`revision` 及兼容旧客户端的 `authUrl: ""`，其他公司账号保留基础信息。

`PUT /api/settings` 按身份接收以下请求：

- 超级管理员：`{authUrl}`，只更新平台站点地址。
- 公司管理员：`{timeZone, baselineSamples, anomalyMultiplier, revision, recalculate?}`，只更新本公司业务配置。公司账号不能提交 `authUrl` 修改平台地址。

### 原有业务接口

`/api/fuel/*` 的台账、档案、导入导出和报表 API 保留原用途，但全部使用当前账号的公司范围。录单参数仍使用车辆 ID 和司机 ID，无需传入公司 ID。其他公司的 ID 对本公司不可见，也不能用于更新、删除或关联。

## 旧版本升级

`drizzle/0006_gorgeous_taskmaster.sql` 迁移建立公司模型并创建以下默认公司：

| 字段 | 值 |
| --- | --- |
| ID | `00000000-0000-4000-8000-000000000001` |
| 编号 | `DEFAULT` |
| 名称 | 默认公司 |

原固定初始账号 `gasoline-single-account` 升级为唯一 `super_admin`，公司归属为空。其他已有账号和历史车辆、司机、台账、修改记录、删除快照迁入默认公司；历史操作者信息保留。迁移删除旧会话，所有账号都需要重新登录。

启动迁移流程同时执行 `lib/db/company-bootstrap.mjs`，将旧加密配置中的业务设置承接到默认公司，平台站点地址保留为平台配置。只有默认公司配置标记 `legacy_initialized=false` 时才复制旧设置，复制完成后更新标记；后续启动不会覆盖管理员已经修改的公司配置。配置承接失败时同样停止启动。

默认公司不一定已有有效管理员：如果升级前唯一管理员就是原固定初始账号，它升级为超级管理员后不再拥有默认公司的业务身份。超级管理员需要在账号管理为默认公司补建 `admin`，并使用另行设置的密码登录该公司账号。系统不能自动继承未知密码或给超级管理员补公司权限。

计费迁移后，迁移前已存在的公司保留原有访问规则，并显示为 `unmanaged`。首次登记线下收款时开始计算租期。到期处理迁移将公司默认设为「到期停用」，延续原有到期行为。

以下是部署时应执行的操作，本文不代表这些操作已经完成：

1. 升级前备份 PostgreSQL 数据库及部署配置，确认备份可用于恢复；备份包含历史台账、账号与公司迁移所需数据。
2. 在维护窗口停止旧版 Web 实例，避免旧代码在迁移期间继续写入无公司归属的数据。更新代码及依赖，并保留迁移文件与元数据。
3. 使用目标环境配置执行 `pnpm db:migrate`，或通过 `pnpm start` 启动时自动执行迁移。`pnpm dev` 同样先执行迁移；迁移失败必须停止启动并处理错误，不能跳过迁移继续服务。
4. 启动新版后，重新登录原固定初始账号，确认其角色为超级管理员；在公司列表检查默认公司的 `adminCount`，必要时补建公司管理员。
5. 后续部署验收需覆盖历史记录完整性、两个公司的互相隔离、公司停用、账号权限、同名司机导入、配置修订冲突、本公司重算、平台汇总以及 Web/Windows 使用流程。
6. 迁移后若需要回退，应恢复与旧版代码匹配的数据库备份及配置；不能仅回退代码并继续写入已经迁移的数据。

2026-11-19 按用户授权完成以下检查：

- `pnpm build`：Web 生产构建通过，包含 Next.js TypeScript 检查。
- `pnpm lint`：ESLint 检查通过。
- `pnpm --dir desktop build`：Windows 客户端前端构建通过。
- `pnpm exec tsc -p desktop/tsconfig.json --noEmit`：客户端 TypeScript 检查通过。

尚未连接现有数据库应用迁移，未启动服务、执行运行时租户隔离验收或生成 Windows 安装包。构建通过不代表数据库迁移和生产部署已经完成。
