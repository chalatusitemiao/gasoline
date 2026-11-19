import { FUEL_IMPORT_LIMIT, FUEL_PAGE_SIZE } from "./fuel";
import { PART_PHOTO_LIMIT, PART_PHOTO_MAX_BYTES, PART_PROJECT_UNASSIGNED, partPhotoMimeTypes } from "./parts";
import { permissions } from "./permissions";

const string = { type: "string" };
const integer = { type: "integer" };
const date = { type: "string", format: "date" };
const dateTime = { type: "string", format: "date-time" };
const uuid = { type: "string", format: "uuid" };
const decimal = { type: "string", description: "十进制数字字符串" };
const decimalInput = { oneOf: [decimal, { type: "number" }] };
const nullableDecimal = { type: ["string", "null"] };
const nullableString = { type: ["string", "null"] };
const nullableUuid = { ...nullableString, format: "uuid" };
const nullableDate = { ...nullableString, format: "date" };
const fuelType = { type: "string", enum: ["diesel", "gasoline"] };
const number = { type: "number" };
const nullableNumber = { type: ["number", "null"] };
const month = { type: "string", pattern: "^(?!0000)\\d{4}-(0[1-9]|1[0-2])$", example: "2026-01" };

const object = (properties: Record<string, unknown>, required?: string[]) =>
  ({ type: "object", properties, ...(required ? { required } : {}) });
const array = (items: Record<string, unknown>) => ({ type: "array", items });
const ref = (name: string) => ({ $ref: "#/components/schemas/" + name });
const query = (name: string, schema: Record<string, unknown>) => ({ name, in: "query", schema });
const pathId = { name: "id", in: "path", required: true, schema: uuid };
const requestBody = (schema: Record<string, unknown>, required = true) => ({
  required, content: { "application/json": { schema } },
});
const envelope = (data: Record<string, unknown>, code = 0) =>
  object({ code: { type: "integer", const: code }, data, message: string }, ["code", "data", "message"]);
const response = (description: string, data: Record<string, unknown>, code = 0) =>
  ({ description, content: { "application/json": { schema: envelope(data, code) } } });

const errors = {
  400: response("请求参数无效", { type: "null" }, 400),
  401: response("账号或密码错误，或需要登录", { type: "null" }, 401),
  403: response("请求来源不受信任或账号无此权限", { type: "null" }, 403),
  404: response("记录不存在", { type: "null" }, 404),
  409: response("档案冲突或仍有历史记录", { type: "null" }, 409),
  500: response("服务端处理失败", { type: "null" }, 500),
};
function replies(data: Record<string, unknown>, status = 200) {
  return { [status]: response("操作成功", data), ...errors };
}

const pageParams = [
  query("page", { ...integer, minimum: 1, default: 1 }),
  query("pageSize", { ...integer, minimum: 1, maximum: 100, default: FUEL_PAGE_SIZE }),
];
const catalogStatus = { type: "string", enum: ["true", "false", "1", "0"] };
const page = (items: Record<string, unknown>, extra?: Record<string, unknown>) =>
  object({ items: array(items), total: integer, page: integer, pageSize: integer, ...extra });
const idResult = object({ id: uuid });
const recordInput = {
  vehicleId: uuid, driverId: uuid, date, fuelType,
  liters: decimalInput, unitPrice: decimalInput, odometer: decimalInput, notes: string,
};
const recordRequired = ["vehicleId", "driverId", "date", "fuelType", "liters", "unitPrice", "odometer"];
const recordFilterParams = [
  query("from", date), query("to", date), query("vehicleId", uuid),
  query("driverId", uuid), query("keyword", string),
  query("anomaliesOnly", { type: "string", enum: ["true", "false", "1", "0"] }),
];
const recordExportFields = {
  date, plate: string, driverId: uuid, driverName: string, fuelType,
  liters: decimal, unitPrice: decimal, amount: decimal, odometer: decimal, distance: nullableDecimal,
  consumption: nullableDecimal, baseline: nullableDecimal,
  anomalyAssessment: {
    description: "进行油耗阈值比较时使用的原值。未进行比较或历史记录尚未保存原值时为空。",
    oneOf: [ref("FuelAnomalyAssessment"), { type: "null" }],
  },
  anomalyReason: { type: ["string", "null"], enum: ["odometer_not_increased", "consumption_high", null] },
  createdBy: string, notes: string,
};
const cookie = { type: "apiKey", in: "cookie", "x-scalar-ignore": true };
const boolean = { type: "boolean" };
const companyUserRole = { type: "string", enum: ["admin", "operator", "viewer"] };
const userRole = { type: "string", enum: ["super_admin", ...companyUserRole.enum] };
const permission = {
  type: "string",
  enum: permissions,
};
const projectInput = {
  name: { ...string, minLength: 1, maxLength: 120 }, manager: { ...string, maxLength: 80 },
  phone: { ...string, maxLength: 40 }, isActive: boolean,
};
const projectSelectionFields = { projectId: nullableUuid, projectName: nullableString, projectIsActive: { type: ["boolean", "null"] } };
const projectFilter = { oneOf: [uuid, { ...string, const: PART_PROJECT_UNASSIGNED }], description: "项目编号，或 unassigned 查询未分配项目。" };
const partFilterParams = [...pageParams, query("vehicleId", uuid), query("month", month), query("projectId", projectFilter)];
const partPhotoMimeType = { ...string, enum: partPhotoMimeTypes };
const partPhotoData = { ...string, contentEncoding: "base64", maxLength: Math.ceil(PART_PHOTO_MAX_BYTES / 3) * 4 };
const partPhoto = { id: uuid, mimeType: partPhotoMimeType };
const partInput = {
  vehicleId: uuid,
  projectId: { ...nullableUuid, description: "新增时省略默认使用车辆当前项目，修改时省略保留原项目。传入 null 表示未分配，可指定历史项目。" },
  date: { ...date, description: "实际购买日期，不能晚于公司业务时区的今天。" },
  name: { ...string, minLength: 1, maxLength: 100 },
  quantity: { ...decimalInput, description: "数量大于 0，最多 7 位整数及 3 位小数。" },
  unitPrice: { ...decimalInput, description: "非负人民币单价，最多 9 位整数及 2 位小数。" },
  purchaseArea: { ...string, maxLength: 100 },
  photos: {
    ...array({ oneOf: [
      object({ id: uuid }, ["id"]),
      object({ mimeType: partPhotoMimeType, data: partPhotoData }, ["mimeType", "data"]),
    ] }), maxItems: PART_PHOTO_LIMIT,
    description: "单张最多 1 MiB。新增时提交图片数据；修改时 id 用于保留已有照片，省略 photos 保留现有照片，传入空数组移除全部照片。",
  },
};
const partRequired = ["vehicleId", "date", "name", "quantity", "unitPrice"];
const partReason = { ...string, minLength: 1, maxLength: 500 };
const partRecord = {
  id: uuid, vehicleId: uuid, plate: string, projectId: nullableUuid, projectName: nullableString,
  date, name: string, quantity: decimal, unitPrice: decimal, amount: decimal, purchaseArea: string,
  createdById: string, createdBy: string, createdAt: dateTime, updatedBy: string, updatedAt: dateTime,
  photos: array(ref("PartPhoto")),
};
const companySettingsFields = {
  timeZone: { ...string, description: "IANA 业务时区，如 Asia/Shanghai" },
  baselineSamples: { ...integer, minimum: 2, maximum: 100, default: 5 },
  anomalyMultiplier: { type: "number", minimum: 1, maximum: 100, default: 1.3 },
};
const companySettingsInput = {
  ...companySettingsFields,
  revision: { ...uuid, description: "读取配置时返回的修订号，用于防止覆盖其他人的修改" },
  recalculate: { ...boolean, default: false, description: "是否按新参数重算本公司历史油耗和异常结果" },
};
const settingsRequired = ["timeZone", "baselineSamples", "anomalyMultiplier", "revision"];
const platformSettingsFields = {
  scope: { ...string, const: "platform" },
  authUrl: { ...string, description: "平台站点源地址，留空自动使用访问地址" },
  username: { ...string, readOnly: true, description: "当前账号，供桌面客户端兼容使用" },
  timeZone: { ...string, readOnly: true, description: "平台兼容时区，默认 Asia/Shanghai，不表示超级管理员可修改公司业务时区" },
};
const companySettingsViewFields = {
  scope: { ...string, const: "company" },
  companyId: uuid,
  companyName: string,
  authUrl: { ...string, const: "", readOnly: true, description: "旧客户端兼容字段，公司账号不能修改平台站点地址" },
  username: { ...string, readOnly: true },
  ...companySettingsFields,
  revision: uuid,
};
const settingsSaved = {
  oneOf: [
    object({ ...platformSettingsFields, requireLogin: boolean }),
    object({ ...companySettingsViewFields, requireLogin: { ...boolean, const: false } }),
  ],
};
const credentials = {
  username: { ...string, minLength: 1, maxLength: 128 },
  password: { ...string, format: "password", minLength: 1, maxLength: 1024, writeOnly: true },
};
const userFields = {
  id: string, name: string, username: string, role: userRole, isActive: boolean,
  companyId: { type: ["string", "null"], format: "uuid", description: "超级管理员为 null；公司账号只能属于一家公司" },
  companyName: { type: ["string", "null"] },
  createdAt: { ...string, format: "date-time" },
};
const userIdPath = { name: "id", in: "path", required: true, schema: string };
const companyInputFields = {
  name: string, contactName: string, contactPhone: string, notes: string,
};
const companyExpiryPolicy = {
  ...boolean,
  description: "true 为到期停用，false 为到期不停用。两种设置都按实际到期时间返回租期状态。",
};
const companyFields = {
  id: uuid, code: { ...string, readOnly: true }, ...companyInputFields,
  isActive: { ...boolean, description: "公司手动启停状态" },
  suspendOnExpiry: companyExpiryPolicy,
  billingStatus: {
    ...string, enum: ["unmanaged", "pending", "active", "expired"],
    description: "unmanaged 表示存量公司暂未纳入计费，pending 表示待首次付款，active 表示租期有效，expired 表示已到期。",
  },
  paidUntil: { type: ["string", "null"], format: "date-time", description: "已付租期的截止时刻，尚未登记付款时为空。" },
  createdAt: { ...string, format: "date-time" },
  updatedAt: { ...string, format: "date-time" },
  accountCount: integer,
  adminCount: { ...integer, description: "有效公司管理员数量；为 0 时需要超级管理员补建" },
};
const renewalMonths = { ...integer, minimum: 1, maximum: 120 };
const companyRenewalFields = {
  id: { ...uuid, description: "本次收款登记的请求编号" },
  amount: { ...decimal, pattern: "^\\d+\\.\\d{2}$", description: "实收人民币金额，保留两位小数。" },
  months: renewalMonths,
  startsAt: dateTime,
  endsAt: dateTime,
  recordedAt: dateTime,
  recordedBy: { ...string, description: "登记人的显示名称" },
};
const platformTotals = {
  accountCount: integer, vehicleCount: integer, driverCount: integer,
  recordCount: integer, totalLiters: decimal, totalAmount: decimal, anomalyCount: integer,
};
const fuelMetrics = {
  count: integer,
  liters: number,
  amount: number,
  distance: number,
  anomalies: integer,
  consumption: nullableNumber,
  amountPerKm: nullableNumber,
  averagePrice: nullableNumber,
  exactTotals: object({
    liters: decimal,
    amount: decimal,
    distance: decimal,
    intervalLiters: { ...decimal, description: "区间里程大于 0 的记录的油量合计" },
  }),
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "车辆监控接口",
    version: "0.1.0",
    description: "登录和初始化提交使用同源请求，登录前可查询初始化状态，业务接口使用 HttpOnly 会话 Cookie。全平台只有一个超级管理员，负责公司管理、公司账号管理和平台汇总；公司管理员、录入员和只读人员仅访问本公司业务。所有台账、档案、导入导出、报表和日志按公司隔离，服务端从有效会话确定公司，不接受通过请求参数切换业务公司。接口统一返回 code、data、message。",
  },
  servers: [{ url: "/" }],
  security: [{ sessionCookie: [] }, { secureSessionCookie: [] }],
  paths: {
    "/api/login": {
      post: {
        tags: ["会话"], summary: "账号登录",
        description: "登录有效期 12 小时，连续 5 次凭据错误后锁定 5 分钟。公司账号凭据正确时，首次租期尚未开通，或租期已到期且公司启用了到期停用，登录会返回 403。已有会话在这些条件下访问业务接口会返回 401。",
        security: [],
        requestBody: requestBody(object(credentials, ["username", "password"])),
        responses: {
          ...replies(object({ name: string })),
          403: response("公司租期尚未开通、已按到期设置停用或请求来源不受信任", { type: "null" }, 403),
          409: response("尚未注册后台账号", { type: "null" }, 409),
          503: response("数据库连接尚未配置", { type: "null" }, 503),
        },
      },
    },
    "/api/logout": {
      post: { tags: ["会话"], summary: "退出登录", responses: replies({ type: "null" }) },
    },
    "/api/me": {
      get: {
        tags: ["会话"], summary: "读取当前账号和权限",
        responses: replies(ref("CurrentUser")),
      },
    },
    "/api/users": {
      get: {
        tags: ["账号管理"], summary: "查询账号列表",
        description: "超级管理员可跨公司查询并使用 companyId 筛选；公司管理员只能查询本公司账号。",
        parameters: [query("companyId", { ...uuid, description: "仅超级管理员可跨公司筛选" })],
        responses: replies(array(ref("User"))),
      },
      post: {
        tags: ["账号管理"], summary: "新增账号",
        description: "用户名全平台唯一。超级管理员新增公司账号时必须提供 companyId；公司管理员只能在本公司创建账号。角色只能是 admin、operator 或 viewer，不能新增超级管理员。",
        requestBody: requestBody(object({
          username: { ...string, minLength: 1, maxLength: 128 },
          password: { ...string, format: "password", minLength: 8, maxLength: 1024, writeOnly: true },
          role: companyUserRole,
          companyId: { ...uuid, description: "超级管理员创建账号时必填；公司管理员的公司由会话确定" },
        }, ["username", "password", "role"])),
        responses: { ...replies(ref("User"), 201), 409: response("登录账号已存在", { type: "null" }, 409) },
      },
    },
    "/api/users/{id}": {
      put: {
        tags: ["账号管理"], summary: "修改账号角色、状态或重置密码",
        description: "仅能维护有管理权限的公司账号，不能修改账号公司归属或将其升级为超级管理员。不得停用或降级公司的最后一名有效管理员；重置密码或变更权限后撤销相应会话。",
        parameters: [userIdPath],
        requestBody: requestBody(object({
          role: companyUserRole,
          isActive: boolean,
          password: { ...string, format: "password", minLength: 8, maxLength: 1024, writeOnly: true },
        }, ["role", "isActive"])),
        responses: {
          ...replies(ref("User")),
          404: response("账号不存在", { type: "null" }, 404),
          409: response("公司至少保留一名有效管理员", { type: "null" }, 409),
        },
      },
    },
    "/api/users/password": {
      put: {
        tags: ["账号管理"], summary: "修改本人密码",
        description: "所有已登录角色均可使用。必须校验当前密码；成功后撤销本人会话，需要重新登录。超级管理员通过此接口维护本人密码。",
        requestBody: requestBody(object({
          currentPassword: { ...credentials.password },
          password: { ...credentials.password, minLength: 8 },
        }, ["currentPassword", "password"])),
        responses: replies(object({ requireLogin: { ...boolean, const: true } }, ["requireLogin"])),
      },
    },
    "/api/users/username": {
      put: {
        tags: ["账号管理"], summary: "修改超级管理员本人的登录账号",
        description: "仅登录的超级管理员可使用，目标账号由会话确定。校验当前密码后修改同一超级管理员账号的登录用户名，撤销该账号的全部会话。随后使用新用户名和当前密码重新登录。",
        requestBody: requestBody({
          ...object({
            username: {
              ...credentials.username,
              description: "新登录用户名，去除首尾空白后为 1 至 128 个字符。按 NFKC 规范化并忽略大小写比较，须全平台唯一。",
            },
            currentPassword: credentials.password,
          }, ["username", "currentPassword"]),
          additionalProperties: false,
        }),
        responses: {
          ...replies(object({ requireLogin: { ...boolean, const: true } }, ["requireLogin"])),
          400: response("请求参数无效、当前密码错误或新旧用户名规范化后相同", { type: "null" }, 400),
          409: response("登录账号已被占用或当前账号已发生变化", { type: "null" }, 409),
        },
      },
    },
    "/api/register": {
      get: {
        tags: ["会话"], summary: "查询超级管理员初始化状态",
        security: [],
        responses: {
          200: response("读取成功", object({
            registrationUnavailable: { ...nullableString, description: "允许初始化时为 null，否则返回提示。" },
          }, ["registrationUnavailable"])),
          500: errors[500],
        },
      },
      post: {
        tags: ["会话"], summary: "初始化唯一超级管理员账号",
        description: "尚未初始化时，使用部署环境的 REGISTRATION_KEY 注册唯一超级管理员。密码至少 8 位。初始化完成后不再允许通过该接口注册其他账号；已有固定初始账号在迁移时升级为超级管理员。",
        security: [],
        requestBody: requestBody(object({
          ...credentials,
          password: { ...credentials.password, minLength: 8 },
          registrationKey: { ...string, format: "password", minLength: 1, maxLength: 1024, writeOnly: true },
        }, ["username", "password", "registrationKey"])),
        responses: {
          ...replies(object({ name: string }), 201),
          403: response("注册密钥错误或请求来源不受信任", { type: "null" }, 403),
          409: response("后台账号已注册", { type: "null" }, 409),
          503: response("注册未启用或数据库连接尚未配置", { type: "null" }, 503),
        },
      },
    },
    "/api/settings": {
      get: {
        tags: ["系统配置"], summary: "按身份读取平台配置或本公司配置",
        description: "超级管理员返回 scope=platform 的平台配置；公司管理员返回 scope=company 的本公司业务配置及 revision；其他公司账号只返回基础账号与业务时区信息。公司账号无权修改平台站点地址。",
        responses: replies({ oneOf: [
          ref("PlatformSettings"), ref("CompanySettings"),
          object({
            scope: { ...string, const: "company" }, username: string, timeZone: string,
            companyId: uuid, companyName: string, authUrl: { ...string, const: "" },
          }),
        ] }),
      },
      put: {
        tags: ["系统配置"], summary: "按身份保存平台配置或本公司配置",
        description: "超级管理员只可提交 authUrl 保存平台配置；公司管理员提交业务时区、基线样本数、异常倍数及 revision，可选 recalculate 重算本公司历史记录。公司配置保存返回 requireLogin=false，不影响其他公司。revision 冲突返回 409。密码通过账号接口单独维护。",
        requestBody: requestBody({ oneOf: [
          object({ authUrl: platformSettingsFields.authUrl }, ["authUrl"]),
          object(companySettingsInput, settingsRequired),
        ] }),
        responses: { ...replies(settingsSaved), 409: response("系统配置已更新", { type: "null" }, 409) },
      },
    },
    "/api/companies": {
      get: {
        tags: ["公司管理"], summary: "分页查询公司",
        description: "仅超级管理员可用。返回手动启停状态、租期状态、到期时间、到期处理、账号数量及有效管理员数量。adminCount=0 的公司需补建公司管理员。",
        parameters: [...pageParams, query("keyword", string)],
        responses: replies(page(ref("Company"))),
      },
      post: {
        tags: ["公司管理"], summary: "创建公司和首个公司管理员",
        description: "仅超级管理员可用。公司及管理员在同一事务中创建，管理员用户名全平台唯一。公司编号由服务端生成。新公司默认为到期停用，初始租期状态为 pending，首次登记收款后方可访问公司业务。",
        requestBody: requestBody(object({
          ...companyInputFields,
          adminUsername: { ...credentials.username },
          adminPassword: { ...credentials.password, minLength: 8 },
        }, ["name", "adminUsername", "adminPassword"])),
        responses: replies(ref("Company"), 201),
      },
    },
    "/api/companies/{id}": {
      put: {
        tags: ["公司管理"], summary: "修改公司资料、启停状态及到期处理",
        description: "仅超级管理员可用。省略 isActive 或 suspendOnExpiry 时沿用对应设置。手动停用公司会阻止该公司账号继续访问，历史数据保留。重新启用后根据租期、到期设置及账号启停状态授予访问权限。",
        parameters: [pathId],
        requestBody: requestBody(object({
          ...companyInputFields, isActive: boolean, suspendOnExpiry: companyExpiryPolicy,
        }, ["name"])),
        responses: replies(ref("Company")),
      },
      patch: {
        tags: ["公司管理"], summary: "单独保存公司到期处理",
        description: "仅超级管理员可用。收款续费弹窗可单独提交到期处理设置。收款和续期由收款续费接口处理。",
        parameters: [pathId],
        requestBody: requestBody({
          ...object({ suspendOnExpiry: companyExpiryPolicy }, ["suspendOnExpiry"]),
          additionalProperties: false,
        }),
        responses: { ...replies(ref("Company")), 404: response("公司不存在", { type: "null" }, 404) },
      },
    },
    "/api/companies/{id}/renewals": {
      get: {
        tags: ["公司管理"], summary: "分页查询公司收款续费记录",
        description: "仅超级管理员可用。按登记时间倒序返回线下收款和续费记录。",
        parameters: [pathId, ...pageParams],
        responses: { ...replies(page(ref("CompanyRenewal"))), 404: response("公司不存在", { type: "null" }, 404) },
      },
      post: {
        tags: ["公司管理"], summary: "登记线下收款并续期",
        description: "仅超级管理员可用。续期从当前到期时刻与登记时刻中较晚的一项开始，按 Asia/Shanghai 自然月计算，目标月份没有对应日期时取该月最后一天。停用状态独立管理。以相同请求编号重试相同收款时返回原记录。",
        parameters: [pathId],
        requestBody: requestBody({
          ...object({
            requestId: { ...uuid, description: "每笔收款使用新的 UUID，重试同一笔收款时沿用原 UUID。" },
            amount: {
              ...string, pattern: "^\\s*(?:0\\.(?:0[1-9]|[1-9]\\d?)|[1-9]\\d{0,9}(?:\\.\\d{1,2})?)\\s*$",
              description: "实收人民币金额，范围为 0.01 至 9999999999.99，最多两位小数。", example: "299.00",
            },
            months: renewalMonths,
          }, ["requestId", "amount", "months"]),
          additionalProperties: false,
        }),
        responses: {
          ...replies(ref("CompanyRenewal"), 201),
          404: response("公司不存在", { type: "null" }, 404),
          409: response("请求编号已用于其他收款内容", { type: "null" }, 409),
        },
      },
    },
    "/api/companies/audit": {
      get: {
        tags: ["公司管理"], summary: "分页查询公司操作审计",
        description: "仅超级管理员可用。审计记录公司创建、资料或状态变更、收款续费、账号及配置等管理操作，不返回密码或密码哈希。",
        parameters: [...pageParams, query("companyId", uuid)],
        responses: replies(page(ref("CompanyAudit"))),
      },
    },
    "/api/platform/summary": {
      get: {
        tags: ["平台汇总"], summary: "按公司查询平台经营汇总",
        description: "仅超级管理员可用，包含启用与停用公司。支持按起止日期（含边界）及公司筛选；日期仅影响 recordCount、totalLiters、totalAmount、anomalyCount，账号、车辆和司机数量为公司当前总量。油量和金额以十进制字符串返回。此接口提供公司级汇总，不授予超级管理员公司业务读写权限。",
        parameters: [query("from", date), query("to", date), query("companyId", uuid)],
        responses: replies(object({
          from: { type: ["string", "null"], format: "date" },
          to: { type: ["string", "null"], format: "date" },
          items: array(object({
            companyId: uuid, companyCode: string, companyName: string, isActive: boolean,
            ...platformTotals,
          })),
          total: object({ companyCount: integer, ...platformTotals }),
        })),
      },
    },
    "/api/fuel/options": {
      get: {
        tags: ["档案"], summary: "查询车辆和司机选项",
        description: "提供当前项目，用于录单及选择车辆与司机。车辆选项省略购入价。",
        responses: replies(object({ vehicles: array(ref("Vehicle")), drivers: array(ref("Driver")) })),
      },
    },
    "/api/fuel/projects": {
      get: {
        tags: ["档案"], summary: "分页查询项目档案",
        parameters: [...pageParams, query("keyword", string), query("isActive", catalogStatus)],
        responses: replies(page(ref("FleetProject"))),
      },
      post: {
        tags: ["档案"], summary: "新增项目档案",
        description: "仅公司管理员可用。项目名称在公司内唯一。",
        requestBody: requestBody(object(projectInput, ["name"])), responses: replies(ref("FleetProject"), 201),
      },
    },
    "/api/fuel/projects/{id}": {
      get: {
        tags: ["档案"], summary: "查询项目详情", parameters: [pathId], responses: replies(ref("FleetProject")),
      },
      put: {
        tags: ["档案"], summary: "修改或启停项目", parameters: [pathId],
        requestBody: requestBody(object(projectInput, ["name"])), responses: replies(ref("FleetProject")),
      },
    },
    "/api/fuel/projects/options": {
      get: {
        tags: ["档案"], summary: "查询项目选项",
        description: "包含已停用项目，便于查询历史配件记录。",
        responses: replies(array(object({ id: uuid, name: string, isActive: boolean }))),
      },
    },
    "/api/fuel/projects/import": {
      post: {
        tags: ["导入"], summary: "批量导入项目档案",
        description: "仅公司管理员可用。有效行新增，批内及库内重名行列入 issues，保留已有项目内容。电话使用文本。",
        requestBody: requestBody(object({ rows: {
          ...array(object({ rowNumber: integer, name: string, manager: string, phone: string }, ["rowNumber", "name"])),
          minItems: 1, maxItems: FUEL_IMPORT_LIMIT,
        } }, ["rows"])),
        responses: replies(object({ added: integer, issues: array(object({ rowNumber: integer, name: string, reason: string })) })),
      },
    },
    "/api/fuel/vehicles": {
      get: {
        tags: ["档案"], summary: "分页查询车辆",
        parameters: [...pageParams, query("keyword", { ...string, description: "车牌或备注" }), query("fuelType", fuelType)],
        responses: replies(page(ref("Vehicle"))),
      },
      post: {
        tags: ["档案"], summary: "新增车辆", requestBody: requestBody(ref("VehicleInput")),
        description: "车牌在本公司内唯一，不同公司可分别维护相同车牌的独立档案。",
        responses: replies(ref("Vehicle"), 201),
      },
    },
    "/api/fuel/vehicles/{id}": {
      get: {
        tags: ["档案"], summary: "查询车辆详情", parameters: [pathId], responses: replies(ref("Vehicle")),
      },
      put: {
        tags: ["档案"], summary: "修改车辆", parameters: [pathId],
        description: "项目、购入日期、购入价省略时沿用原值，传入 null 可清空。停用项目可保留原关联。",
        requestBody: requestBody(ref("VehicleInput")), responses: replies(ref("Vehicle")),
      },
      delete: {
        tags: ["档案"], summary: "删除无加油及配件历史的车辆", parameters: [pathId],
        responses: replies(idResult),
      },
    },
    "/api/fuel/vehicles/{id}/recent": {
      get: {
        tags: ["台账"], summary: "查询录单日期前的最近三条记录",
        parameters: [pathId, query("through", date), query("excludeId", uuid)],
        responses: replies(object({
          latest: { oneOf: [ref("FuelRecord"), { type: "null" }] },
          items: array(ref("FuelRecord")),
        })),
      },
    },
    "/api/fuel/vehicles/import": {
      post: {
        tags: ["导入"], summary: "批量导入车辆档案",
        requestBody: requestBody(object({
          plates: { ...array(string), minItems: 1, maxItems: FUEL_IMPORT_LIMIT },
          fuelType,
          notes: string,
        }, ["plates", "fuelType"])),
        responses: replies(object({ added: array(string), existing: array(string), invalid: array(string) })),
      },
    },
    "/api/fuel/drivers": {
      get: {
        tags: ["档案"], summary: "分页查询司机",
        parameters: [
          ...pageParams,
          query("keyword", { ...string, description: "姓名、手机号、备注或档案编号" }),
          query("isActive", catalogStatus),
        ],
        responses: replies(page(ref("Driver"))),
      },
      post: {
        tags: ["档案"], summary: "新增司机",
        description: "允许本公司内存在同名司机。录入和编辑加油记录通过 driverId 区分档案，不能仅依赖姓名。",
        requestBody: requestBody(ref("DriverInput")),
        responses: replies(ref("Driver"), 201),
      },
    },
    "/api/fuel/drivers/{id}": {
      get: {
        tags: ["档案"], summary: "查询司机详情", parameters: [pathId], responses: replies(ref("Driver")),
      },
      put: {
        tags: ["档案"], summary: "修改司机", parameters: [pathId],
        description: "仅能修改本公司司机。项目省略时沿用原值，传入 null 可清空。档案身份由 id 确定，同公司司机可以同名。",
        requestBody: requestBody(ref("DriverInput")), responses: replies(ref("Driver")),
      },
      delete: {
        tags: ["档案"], summary: "删除无加油记录的司机", parameters: [pathId],
        responses: replies(idResult),
      },
    },
    "/api/fuel/records": {
      get: {
        tags: ["台账"], summary: "筛选加油记录并汇总",
        parameters: [...pageParams, ...recordFilterParams],
        responses: replies(page(ref("FuelRecord"), {
          summary: object({
            recordCount: integer, totalLiters: decimal, totalAmount: decimal,
            totalDistance: decimal,
            averageConsumption: { ...nullableDecimal, description: "平均油耗，保留 6 位小数" },
            exactAverageConsumption: { ...nullableDecimal, description: "未按显示精度舍入的平均油耗" },
            anomalyCount: integer,
          }),
        })),
      },
      post: {
        tags: ["台账"], summary: "手工录入一条加油记录",
        description: "日期按业务时区判断且不能是未来。金额由服务端用油量乘单价计算。",
        requestBody: requestBody(ref("FuelRecordInput")), responses: replies(ref("FuelRecord"), 201),
      },
    },
    "/api/fuel/records/export": {
      get: {
        tags: ["台账"], summary: "查询加油明细导出数据",
        description: "使用与列表相同的筛选条件，按日期、入库顺序倒序返回同一快照中的全部匹配记录。",
        parameters: recordFilterParams,
        responses: replies(array(ref("FuelRecordExportRow"))),
      },
    },
    "/api/fuel/records/{id}": {
      get: {
        tags: ["台账"], summary: "查询记录详情及修改留痕", parameters: [pathId],
        responses: replies(object({ record: ref("FuelRecord"), changes: array(ref("FuelChange")) })),
      },
      put: {
        tags: ["台账"], summary: "修改记录并重算受影响车辆", parameters: [pathId],
        requestBody: requestBody(object({ ...recordInput, reason: string }, [...recordRequired, "reason"])),
        responses: replies(ref("FuelRecord")),
      },
      delete: {
        tags: ["台账"], summary: "写入删除快照后删除记录并重算", parameters: [pathId],
        requestBody: requestBody(object({ reason: string }), false),
        responses: replies(idResult),
      },
    },
    "/api/fuel/deletions": {
      get: {
        tags: ["台账"], summary: "分页查询最近 12 个月的删除日志", parameters: pageParams,
        responses: replies(page(object({
          id: uuid, recordId: uuid, plate: string, deletedAt: string,
          deletedBy: string, reason: string, snapshot: ref("FuelRecord"),
        }))),
      },
    },
    "/api/fuel/import": {
      post: {
        tags: ["导入"], summary: "按行导入加油台账",
        description: "仅匹配本公司的车牌和司机姓名，缺少档案时在本公司新建。若本公司存在多个规范化后同名司机，该行按歧义错误跳过，不能任选或匹配其他公司档案。保留文件金额，反算单价；错行返回原文件行号和原因。",
        requestBody: requestBody(object({
          fuelType,
          date1904: {
            ...boolean, default: false,
            description: "数字日期序号是否使用 Excel 1904 日期系统。CSV 和省略此字段的请求按 1900 日期系统解释，序号的小数部分不计入日期。",
          },
          rows: { ...array(object({
            rowNumber: integer, plate: string, date: string, liters: string,
            amount: string, odometer: string, driver: string,
          }, ["rowNumber", "plate", "date", "liters", "amount", "odometer", "driver"])), minItems: 1, maxItems: FUEL_IMPORT_LIMIT },
        }, ["rows"])),
        responses: replies(object({ imported: integer, issues: array(object({ rowNumber: integer, message: string })) })),
      },
    },
    "/api/fuel/analytics": {
      get: {
        tags: ["报表"], summary: "查询经营看板或指定报表",
        parameters: [
          query("view", { type: "string", enum: ["dashboard", "vehicles", "drivers", "costs"], default: "dashboard" }),
          query("from", { ...month, description: "起始月份（含）。经营看板固定查询近 6 个月。" }),
          query("to", { ...month, description: "结束月份（含）。默认业务时区的本月。" }),
        ],
        responses: replies(object({
          from: month, to: month, currentMonth: month,
          total: object(fuelMetrics),
          months: array(ref("FuelMonthMetrics")),
          vehicles: array(object({ ...fuelMetrics, vehicleId: uuid, plate: string, months: array(ref("FuelMonthMetrics")) })),
          drivers: array(object({ ...fuelMetrics, driverId: uuid, name: string, usualVehicles: array(string) })),
          recentAnomalies: array(object({
            id: uuid, date, plate: string, driverId: uuid, driver: string, odometer: decimal,
            distance: nullableDecimal, consumption: nullableDecimal,
            reason: { type: ["string", "null"], enum: ["odometer_not_increased", "consumption_high", null] },
          })),
        })),
      },
    },
    "/api/parts/records": {
      get: {
        tags: ["车辆配件"], summary: "分页查询有效配件记录",
        parameters: partFilterParams, responses: replies(page(ref("PartRecord"), { totalAmount: decimal })),
      },
      post: {
        tags: ["车辆配件"], summary: "录入配件记录",
        description: "服务端按数量乘单价计算总价并保留两位小数。车辆及项目须属于登录账号所在公司。",
        requestBody: requestBody(object(partInput, partRequired)), responses: replies(ref("PartRecord"), 201),
      },
    },
    "/api/parts/records/{id}": {
      get: {
        tags: ["车辆配件"], summary: "查询配件明细和修改历史", parameters: [pathId],
        responses: replies(object({ record: ref("PartRecord"), changes: array(ref("FuelChange")) })),
      },
      put: {
        tags: ["车辆配件"], summary: "修改配件记录并留痕", parameters: [pathId],
        description: "公司管理员可修改本公司配件记录，录入员可修改本人创建的记录。",
        requestBody: requestBody(object({ ...partInput, reason: partReason }, [...partRequired, "reason"])),
        responses: replies(ref("PartRecord")),
      },
      delete: {
        tags: ["车辆配件"], summary: "删除配件记录并保留留档", parameters: [pathId],
        description: "仅公司管理员可用。删除后仍可通过删除日志查看原单。",
        requestBody: requestBody(object({ reason: partReason }, ["reason"])), responses: replies(idResult),
      },
    },
    "/api/parts/deletions": {
      get: {
        tags: ["车辆配件"], summary: "分页查询配件删除日志", parameters: partFilterParams,
        description: "仅公司管理员可用。按原配件记录的车牌、购买月份与项目归属筛选。",
        responses: replies(page(object({ ...partRecord, deletedBy: string, deletedAt: dateTime, deletionReason: string }))),
      },
    },
    "/api/parts/photos/{id}": {
      get: {
        tags: ["车辆配件"], summary: "读取配件照片", parameters: [pathId],
        description: "返回 Base64 数据。已删除记录的照片及已移除照片仅限公司管理员查看。",
        responses: replies(object({ ...partPhoto, data: partPhotoData })),
      },
    },
    "/api/parts/costs": {
      get: {
        tags: ["报表"], summary: "按车牌或项目查询配件成本",
        description: "车牌模式统计累计、本月及近 12 个月配件费。项目模式按每笔有效记录所存项目归属和所选月份统计，仅展示当月有记录的车辆。",
        parameters: [
          { ...query("scope", { type: "string", enum: ["vehicle", "project"] }), required: true },
          query("vehicleId", { ...uuid, description: "scope=vehicle 时必填。" }),
          query("projectId", { ...projectFilter, description: "scope=project 时必填，可用 unassigned。" }),
          query("month", { ...month, description: "项目模式的月份，省略时为公司业务时区的本月。" }),
        ],
        responses: replies({ oneOf: [
          object({
            scope: { ...string, const: "vehicle" }, vehicleId: uuid, month, totalAmount: decimal, monthAmount: decimal,
            months: array(object({ month, amount: decimal })),
          }, ["scope", "vehicleId", "month", "totalAmount", "monthAmount", "months"]),
          object({
            scope: { ...string, const: "project" }, projectId: projectFilter, month, totalAmount: decimal,
            vehicles: array(object({ vehicleId: uuid, plate: string, amount: decimal, count: integer })),
          }, ["scope", "projectId", "month", "totalAmount", "vehicles"]),
        ] }),
      },
    },
    "/api/vehicle-costs": {
      get: {
        tags: ["报表"], summary: "查询累计车辆成本及 Excel 导出数据",
        description: "仅公司管理员可用。累计已知成本为已录入购入价与有效配件费之和。购入价缺失时返回 null。项目筛选按车辆档案当前项目。",
        parameters: [query("vehicleId", uuid), query("projectId", projectFilter)],
        responses: replies(object({
          items: array(object({
            id: uuid, plate: string, projectName: nullableString, purchaseDate: nullableDate, purchasePrice: nullableDecimal,
            partsAmount: decimal, knownAmount: decimal,
          })),
          totalPurchasePrice: decimal, totalPartsAmount: decimal, totalKnownAmount: decimal, missingPurchasePriceCount: integer,
        })),
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: { ...cookie, name: "better-auth.session_token" },
      secureSessionCookie: { ...cookie, name: "__Secure-better-auth.session_token" },
    },
    schemas: {
      UserRole: userRole,
      CompanyUserRole: companyUserRole,
      Permission: permission,
      User: object(userFields, ["id", "name", "username", "role", "companyId", "companyName", "isActive", "createdAt"]),
      Company: object(companyFields, [
        "id", "code", "name", "contactName", "contactPhone", "notes", "isActive",
        "suspendOnExpiry", "billingStatus", "paidUntil", "createdAt", "updatedAt", "accountCount", "adminCount",
      ]),
      CompanyRenewal: object(companyRenewalFields, ["id", "amount", "months", "startsAt", "endsAt", "recordedAt", "recordedBy"]),
      CompanyAudit: object({
        id: uuid, companyId: { type: ["string", "null"], format: "uuid" },
        actorId: string, actorName: string, action: string, targetId: string,
        details: { type: "object", additionalProperties: true },
        createdAt: { ...string, format: "date-time" },
      }, ["id", "companyId", "actorId", "actorName", "action", "targetId", "details", "createdAt"]),
      PlatformSettings: object(platformSettingsFields, ["scope", "authUrl", "username", "timeZone"]),
      CompanySettings: object(companySettingsViewFields, [
        "scope", "companyId", "companyName", "authUrl", "username", "timeZone", "baselineSamples", "anomalyMultiplier", "revision",
      ]),
      CurrentUser: object({
        id: string,
        name: string,
        role: userRole,
        companyId: { type: ["string", "null"], format: "uuid" },
        companyName: { type: ["string", "null"] },
        permissions: array(permission),
        timeZone: string,
      }, ["id", "name", "role", "companyId", "companyName", "permissions", "timeZone"]),
      FuelMonthMetrics: object({ ...fuelMetrics, month }),
      FleetProject: object({ id: uuid, ...projectInput, createdAt: dateTime, updatedAt: dateTime }),
      PartPhoto: object(partPhoto, ["id", "mimeType"]),
      PartRecord: object(partRecord, Object.keys(partRecord)),
      VehicleInput: object({
        plate: string, fuelType, notes: string, projectId: nullableUuid, purchaseDate: nullableDate,
        purchasePrice: { oneOf: [...decimalInput.oneOf, { type: "null" }], description: "非负购入价，最多 16 位整数和 2 位小数，仅公司管理员可维护。" },
      }, ["plate", "fuelType"]),
      Vehicle: object({
        id: uuid, plate: string, fuelType, notes: string, createdAt: string, updatedAt: string,
        refuelCount: integer, lastDate: nullableDate, lastOdometer: nullableDecimal, hasPartRecords: boolean,
        ...projectSelectionFields, purchaseDate: nullableDate,
        purchasePrice: { ...nullableDecimal, description: "仅公司管理员查询车辆档案时返回，未录入为 null。" },
      }),
      DriverInput: object({ name: string, phone: string, isActive: boolean, notes: string, projectId: nullableUuid }, ["name", "isActive"]),
      Driver: object({
        id: uuid, name: string, phone: string, isActive: boolean, notes: string, ...projectSelectionFields,
        createdAt: string, updatedAt: string, refuelCount: integer,
      }),
      FuelRecordInput: object(recordInput, recordRequired),
      FuelAnomalyAssessment: object({
        consumption: decimal, baseline: decimal, multiplier: decimal, threshold: decimal, sampleCount: integer,
      }, ["consumption", "baseline", "multiplier", "threshold", "sampleCount"]),
      FuelRecordExportRow: object(recordExportFields),
      FuelRecord: object({
        ...recordExportFields, id: uuid, vehicleId: uuid,
        createdById: string,
        isAnomaly: { type: "boolean" },
        source: { type: "string", enum: ["manual", "import"] },
        updatedBy: string, createdAt: string, updatedAt: string,
      }),
      FuelChange: object({
        id: uuid, changedBy: string, changedAt: string, reason: string,
        changes: array(object({ field: string, before: string, after: string })),
      }),
    },
  },
};
