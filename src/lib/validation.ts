import { z } from "zod";
import { CATEGORIES } from "./domain";

export const createIdeaSchema = z.object({
  title: z.string().trim().min(1, "Nhập tên ý tưởng").max(80, "Tên ý tưởng tối đa 80 ký tự"),
  description: z.string().trim().min(1, "Nhập mô tả ý tưởng").max(240, "Mô tả tối đa 240 ký tự"),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string().trim().min(1).max(28)).max(12).default([])
    .transform(tags => [...new Set(tags)]),
}).strict();
export const createCommentSchema = z.object({
  text: z.string().trim().min(1, "Nội dung không được để trống").max(2000, "Bình luận tối đa 2000 ký tự"),
  parentId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).nullable().optional(),
}).strict();
export const ideaQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  view: z.enum(["all", "joined", "mine"]).default("all"),
  sort: z.enum(["new", "popular"]).default("new"),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const commentQuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
