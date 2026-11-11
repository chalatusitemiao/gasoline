import { apiFailure, ApiError, apiResponse, requireRequestOrigin } from "@/lib/server-api";
import { body } from "@/lib/fuel-server/shared";
import { getSystemSettingsSnapshot, isSystemConfigured } from "@/lib/system-settings";
import { saveSystemSettings, setupInput } from "@/lib/system-settings-admin";
import { matchesSetupCode } from "@/lib/system-settings-store";

export async function POST(request: Request) {
  try {
    requireRequestOrigin(request);
    const input = await body(request, setupInput);
    if (!matchesSetupCode(input.setupSecret)) throw new ApiError(403, "初始化验证码错误");

    const { settings, revision } = await getSystemSettingsSnapshot();
    if (isSystemConfigured(settings)) throw new ApiError(409, "系统已初始化，请登录后台修改设置");

    const result = await saveSystemSettings(input, settings, revision, true);
    return apiResponse(201, result, "系统初始化成功");
  } catch (error) {
    return apiFailure(error);
  }
}
