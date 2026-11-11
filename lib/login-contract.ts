import { z } from "zod";

export const loginErrorMessage = "账号或密码错误";
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024),
});
