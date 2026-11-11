import { FUEL_IMPORT_LIMIT, FUEL_PAGE_SIZE } from "./fuel";

const string = { type: "string" };
const integer = { type: "integer" };
const date = { type: "string", format: "date" };
const uuid = { type: "string", format: "uuid" };
const decimal = { type: "string", description: "十进制数字字符串" };
const decimalInput = { oneOf: [decimal, { type: "number" }] };
const nullableDecimal = { type: ["string", "null"] };
const fuelType = { type: "string", enum: ["diesel", "gasoline"] };

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
  403: response("请求来源不受信任", { type: "null" }, 403),
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
const catalogParams = [...pageParams, query("keyword", string)];
const page = (items: Record<string, unknown>, extra?: Record<string, unknown>) =>
  object({ items: array(items), total: integer, page: integer, pageSize: integer, ...extra });
const idResult = object({ id: uuid });
const recordInput = {
  vehicleId: uuid, driverId: uuid, date, fuelType,
  liters: decimalInput, unitPrice: decimalInput, odometer: decimalInput, notes: string,
};
const recordRequired = ["vehicleId", "driverId", "date", "fuelType", "liters", "unitPrice", "odometer"];
const cookie = { type: "apiKey", in: "cookie", "x-scalar-ignore": true };
const boolean = { type: "boolean" };
const systemSettings = {
  authUrl: { ...string, description: "站点源地址，留空自动使用访问地址" },
  username: { ...string, minLength: 1, maxLength: 128 },
  timeZone: { ...string, description: "IANA 业务时区，如 Asia/Shanghai" },
  baselineSamples: { ...integer, minimum: 2, maximum: 100, default: 5 },
  anomalyMultiplier: { type: "number", minimum: 1, maximum: 100, default: 1.3 },
};
const systemSettingsInput = {
  ...systemSettings,
  authUrl: { ...string, description: "省略时保留已有值，传空字符串时使用当前访问地址" },
  password: { ...string, format: "password", description: "后台登录密码，留空保留现有密码" },
};
const settingsRequired = ["username", "timeZone", "baselineSamples", "anomalyMultiplier"];
const settingsSaved = object({ ...systemSettings, requireLogin: boolean });
const credentials = {
  username: systemSettings.username,
  password: { ...string, format: "password", minLength: 1, maxLength: 1024, writeOnly: true },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "车辆监控接口",
    version: "0.1.0",
    description: "登录与注册使用同源请求，其余接口使用 HttpOnly 会话 Cookie。接口统一返回 code、data、message。",
  },
  servers: [{ url: "/" }],
  security: [{ sessionCookie: [] }, { secureSessionCookie: [] }],
  paths: {
    "/api/login": {
      post: {
        tags: ["会话"], summary: "单账号登录",
        description: "登录有效期 12 小时，连续 5 次凭据错误后锁定 5 分钟。",
        security: [],
        requestBody: requestBody(object(credentials, ["username", "password"])),
        responses: {
          ...replies(object({ name: string })),
          409: response("尚未注册后台账号", { type: "null" }, 409),
          503: response("数据库连接尚未配置", { type: "null" }, 503),
        },
      },
    },
    "/api/logout": {
      post: { tags: ["会话"], summary: "退出登录", responses: replies({ type: "null" }) },
    },
    "/api/register": {
      post: {
        tags: ["会话"], summary: "注册后台账号",
        description: "尚无后台账号时，使用部署环境的 REGISTRATION_KEY 注册。用户记录和系统配置在同一笔数据库事务中保存。提交后尝试建立登录会话，自动登录失败时可手动登录。",
        security: [],
        requestBody: requestBody(object({
          ...credentials,
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
        tags: ["系统配置"], summary: "读取系统配置",
        responses: replies(object(systemSettings)),
      },
      put: {
        tags: ["系统配置"], summary: "保存系统配置",
        requestBody: requestBody(object(systemSettingsInput, settingsRequired)),
        responses: { ...replies(settingsSaved), 409: response("系统配置已更新", { type: "null" }, 409) },
      },
    },
    "/api/fuel/options": {
      get: {
        tags: ["档案"], summary: "查询车辆和司机选项",
        responses: replies(object({ vehicles: array(ref("Vehicle")), drivers: array(ref("Driver")) })),
      },
    },
    "/api/fuel/vehicles": {
      get: {
        tags: ["档案"], summary: "分页查询车辆", parameters: catalogParams,
        responses: replies(page(ref("Vehicle"))),
      },
      post: {
        tags: ["档案"], summary: "新增车辆", requestBody: requestBody(ref("VehicleInput")),
        responses: replies(ref("Vehicle"), 201),
      },
    },
    "/api/fuel/vehicles/{id}": {
      get: {
        tags: ["档案"], summary: "查询车辆详情", parameters: [pathId], responses: replies(ref("Vehicle")),
      },
      put: {
        tags: ["档案"], summary: "修改车辆", parameters: [pathId],
        requestBody: requestBody(ref("VehicleInput")), responses: replies(ref("Vehicle")),
      },
      delete: {
        tags: ["档案"], summary: "删除无加油记录的车辆", parameters: [pathId],
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
        requestBody: requestBody(object({ plates: array(string), fuelType, notes: string }, ["plates", "fuelType"])),
        responses: replies(object({ added: array(string), existing: array(string), invalid: array(string) })),
      },
    },
    "/api/fuel/drivers": {
      get: {
        tags: ["档案"], summary: "分页查询司机", parameters: catalogParams,
        responses: replies(page(ref("Driver"))),
      },
      post: {
        tags: ["档案"], summary: "新增司机", requestBody: requestBody(ref("DriverInput")),
        responses: replies(ref("Driver"), 201),
      },
    },
    "/api/fuel/drivers/{id}": {
      get: {
        tags: ["档案"], summary: "查询司机详情", parameters: [pathId], responses: replies(ref("Driver")),
      },
      put: {
        tags: ["档案"], summary: "修改司机", parameters: [pathId],
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
        parameters: [
          ...pageParams, query("from", date), query("to", date), query("vehicleId", uuid),
          query("driverId", uuid), query("keyword", string),
          query("anomaliesOnly", { type: "string", enum: ["true", "false", "1", "0"] }),
        ],
        responses: replies(page(ref("FuelRecord"), {
          summary: object({
            recordCount: integer, totalLiters: decimal, totalAmount: decimal,
            totalDistance: decimal, averageConsumption: nullableDecimal, anomalyCount: integer,
          }),
        })),
      },
      post: {
        tags: ["台账"], summary: "手工录入一条加油记录",
        description: "日期按业务时区判断且不能是未来。金额由服务端用油量乘单价计算。",
        requestBody: requestBody(ref("FuelRecordInput")), responses: replies(ref("FuelRecord"), 201),
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
        description: "保留文件金额，反算单价。错行跳过，返回原文件行号和原因。",
        requestBody: requestBody(object({
          fuelType,
          rows: { ...array(object({
            rowNumber: integer, plate: string, date: string, liters: string,
            amount: string, odometer: string, driver: string,
          })), maxItems: FUEL_IMPORT_LIMIT },
        }, ["rows"])),
        responses: replies(object({ imported: integer, issues: array(object({ rowNumber: integer, message: string })) })),
      },
    },
    "/api/fuel/analytics": {
      get: {
        tags: ["报表"], summary: "查询经营看板或指定报表",
        parameters: [
          query("view", { type: "string", enum: ["dashboard", "vehicles", "drivers", "costs"] }),
          query("from", { type: "string", example: "2026-01" }),
          query("to", { type: "string", example: "2026-06" }),
        ],
        responses: replies({ type: "object", description: "统计、排行、矩阵或趋势数据，由 view 决定" }),
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: { ...cookie, name: "better-auth.session_token" },
      secureSessionCookie: { ...cookie, name: "__Secure-better-auth.session_token" },
    },
    schemas: {
      VehicleInput: object({ plate: string, fuelType, notes: string }, ["plate", "fuelType"]),
      Vehicle: object({
        id: uuid, plate: string, fuelType, notes: string, createdAt: string, updatedAt: string,
        refuelCount: integer, lastDate: { type: ["string", "null"] }, lastOdometer: nullableDecimal,
      }),
      DriverInput: object({ name: string, phone: string, isActive: { type: "boolean" }, notes: string }, ["name", "isActive"]),
      Driver: object({
        id: uuid, name: string, phone: string, isActive: { type: "boolean" }, notes: string,
        createdAt: string, updatedAt: string, refuelCount: integer,
      }),
      FuelRecordInput: object(recordInput, recordRequired),
      FuelRecord: object({
        ...recordInput, id: uuid, plate: string, driverName: string, liters: decimal,
        unitPrice: decimal, odometer: decimal, amount: decimal, distance: nullableDecimal,
        consumption: nullableDecimal, baseline: nullableDecimal,
        isAnomaly: { type: "boolean" },
        anomalyReason: { type: ["string", "null"], enum: ["odometer_not_increased", "consumption_high", null] },
        source: { type: "string", enum: ["manual", "import"] },
        createdBy: string, updatedBy: string, createdAt: string, updatedAt: string,
      }),
      FuelChange: object({
        id: uuid, changedBy: string, changedAt: string, reason: string,
        changes: array(object({ field: string, before: string, after: string })),
      }),
    },
  },
};
