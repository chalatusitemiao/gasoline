import { z } from "zod";

export const loginErrorMessage = "账号或密码错误";
export const usernameSchema = z.string().trim().min(1, "请输入用户名").max(128)
  .refine((value) => !value.includes("\u0000"), "用户名包含无效字符");

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(1024),
});
