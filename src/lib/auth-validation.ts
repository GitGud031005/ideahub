import { z } from "zod";
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/, "Username gồm 3–24 chữ cái không dấu, số hoặc dấu gạch dưới");
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1, "Nhập mật khẩu").max(128, "Mật khẩu tối đa 128 ký tự") }).strict();
export const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, "Nhập họ tên có ít nhất 2 ký tự").max(80, "Họ tên tối đa 80 ký tự").regex(/^[^\p{C}]+$/u, "Họ tên chứa ký tự không hợp lệ").transform(name => name.normalize("NFC").replace(/\s+/g, " ")),
  password: z.string().min(8, "Dùng mật khẩu có ít nhất 8 ký tự").max(128, "Mật khẩu tối đa 128 ký tự"),
}).strict();

export const profileSchema = z.object({ name: registerSchema.shape.fullName }).strict();
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại").max(128, "Mật khẩu tối đa 128 ký tự"),
  newPassword: registerSchema.shape.password,
}).strict();
export const passwordChangeFormSchema = passwordChangeSchema.extend({ confirmPassword: z.string().min(1, "Nhập lại mật khẩu mới") })
  .refine(input => input.newPassword === input.confirmPassword, { path: ["confirmPassword"], message: "Mật khẩu nhập lại chưa khớp" });
