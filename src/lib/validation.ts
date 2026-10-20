import { z } from "zod";
import { CATEGORIES } from "./domain";
import { IDEA_TAG_SET } from "./idea-tags";

export const createIdeaSchema = z.object({
  title: z.string().trim().min(1, "Nhập tên ý tưởng").max(80, "Tên ý tưởng tối đa 80 ký tự"),
  description: z.string().trim().min(1, "Nhập mô tả ý tưởng").max(240, "Mô tả tối đa 240 ký tự"),
  category: z.enum(CATEGORIES).optional(),
  tags: z.array(z.string().trim().min(1).max(28).refine(tag=>IDEA_TAG_SET.has(tag),"Chọn tag trong danh mục có sẵn")).max(12).default([])
    .transform(tags => [...new Set(tags)]),
}).strict();
export const createCommentSchema = z.object({
  text: z.string().trim().max(2000, "Bình luận tối đa 2000 ký tự"),
  attachmentIds: z.array(z.string().uuid()).max(5).refine(ids=>new Set(ids).size===ids.length).optional(),
  clientId: z.string().uuid().optional(),
  parentId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).nullable().optional(),
}).strict().refine(input=>!!input.text||(input.attachmentIds?.length??0)>0,{message:"Nhập nội dung hoặc chọn tệp đính kèm"});
export const updateIdeaStatusSchema = z.object({ status: z.enum(["potential", "archived"]) }).strict();
export const ideaQuerySchema = z.object({
  q: z.string().trim().max(120).default(""),
  view: z.enum(["all", "new", "potential", "archived", "mine"]).default("all"),
  sort: z.enum(["new", "popular"]).default("new"),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  cursor: z.string().min(1).max(2000).optional(),
});
export const commentQuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const tagSuggestionInputSchema=createIdeaSchema.pick({title:true,description:true}).strict();
