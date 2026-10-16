"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { CATEGORIES, type Category, type CreateIdeaInput, type Idea } from "@/lib/domain";
import { createIdeaSchema } from "@/lib/validation";
import { Select } from "./select";
import { useSession } from "./providers";

export function CreateIdea({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), titleRef = useRef<HTMLInputElement>(null), client = useQueryClient(), router = useRouter();
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [category, setCategory] = useState<Category>("Công nghệ"), [tags, setTags] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const session = useSession();
  const mutation = useMutation({ mutationFn: (body: CreateIdeaInput) => api<Idea>("/ideas", { method: "POST", body: JSON.stringify(body) }), onSuccess: idea => { client.invalidateQueries({ queryKey: ["ideas"] }); client.setQueryData(["idea", idea.id], idea); onClose(); router.push(`/ideas/${idea.id}`); } });
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); titleRef.current?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);
  return <dialog ref={ref} className="ih-create-dialog" aria-labelledby="create-title" onCancel={event => { event.preventDefault(); if (!mutation.isPending) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !mutation.isPending) onClose(); }}>
    <div className="ih-dialog-top"><span className="ih-eyebrow">MỘT KHỞI ĐẦU MỚI</span><button type="button" className="ih-icon-button" aria-label="Đóng" disabled={mutation.isPending} onClick={onClose}><X size={17} /></button></div>
    <h2 id="create-title">Bạn đang nghĩ về điều gì?</h2><p className="ih-dialog-subtitle">Một vài dòng là đủ để bắt đầu cuộc trò chuyện</p>
    <form noValidate onSubmit={event => { event.preventDefault(); const result = createIdeaSchema.safeParse({ title, description, category, tags: tags.split(",").map(t => t.trim()).filter(Boolean) }); if (!result.success) { setValidation(result.error.issues[0]?.message || "Kiểm tra nội dung"); return; } setValidation(null); mutation.mutate(result.data); }}>
      <label htmlFor="idea-title">Tên ý tưởng <span>*</span></label><input ref={titleRef} id="idea-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Một cái tên ngắn gọn, dễ nhớ" required /><div className="ih-field-meta"><span>Tóm gọn điều bạn muốn làm</span><span>{title.length}/80</span></div>
      <label htmlFor="idea-description">Mô tả ngắn <span>*</span></label><textarea id="idea-description" value={description} onChange={e => setDescription(e.target.value)} maxLength={240} rows={4} placeholder="Ý tưởng này giải quyết điều gì? Bạn muốn tìm ai cùng thảo luận?" required /><div className="ih-field-meta"><span>Để mọi người hiểu idea của bạn</span><span>{description.length}/240</span></div>
      <div className="ih-field-label">Chủ đề</div><Select label="Chủ đề" value={category} options={CATEGORIES.map(value => ({ value, label: value }))} onChange={setCategory} wide disabled={mutation.isPending} />
      <label htmlFor="idea-tags">Tags</label><input id="idea-tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="Ví dụ: Python, Data crawling, Teamwork" maxLength={340} /><div className="ih-field-meta"><span>Ngăn cách bằng dấu phẩy · tối đa 12 tags</span></div>
      {session.data?.storage === "memory" && <p className="ih-demo-note">Dữ liệu thử nghiệm có thể được đặt lại</p>}
      {(validation || mutation.error) && <p className="ih-form-error" role="alert">{validation || mutation.error?.message}</p>}
      <div className="ih-form-footer"><button type="button" className="ih-secondary" disabled={mutation.isPending} onClick={onClose}>Để sau</button><button type="submit" className="ih-primary" disabled={mutation.isPending}>{mutation.isPending ? "Đang đăng..." : "Đăng ý tưởng"}<ArrowUpRight size={14} aria-hidden="true" /></button></div>
    </form>
  </dialog>;
}
