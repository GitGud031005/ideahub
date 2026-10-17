"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { CATEGORIES, type Category, type CreateIdeaInput, type Idea } from "@/lib/domain";
import { createIdeaSchema } from "@/lib/validation";
import { Select } from "./select";
import { useSession } from "./providers";

type FieldName = "title" | "description" | "tags";
type FieldErrors = Partial<Record<FieldName, string>>;

export function CreateIdea({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), titleRef = useRef<HTMLInputElement>(null), client = useQueryClient(), router = useRouter();
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [category, setCategory] = useState<Category>("Công nghệ"), [tags, setTags] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const session = useSession();
  const mutation = useMutation({ mutationFn: (body: CreateIdeaInput) => api<Idea>("/ideas", { method: "POST", body: JSON.stringify(body) }), onSuccess: idea => { client.invalidateQueries({ queryKey: ["ideas"] }); client.setQueryData(["idea", idea.id], idea); onClose(); router.push(`/ideas/${idea.id}`); } });
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); titleRef.current?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);

  function clearError(field: FieldName) {
    setErrors(current => { if (!current[field]) return current; const next = { ...current }; delete next[field]; return next; });
    if (mutation.isError) mutation.reset();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const result = createIdeaSchema.safeParse({ title, description, category, tags: tags.split(",").map(t => t.trim()).filter(Boolean) });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === "title" || field === "description" || field === "tags") {
          next[field] ??= field === "tags" ? "Dùng tối đa 12 tags, mỗi tag không quá 28 ký tự" : issue.message;
        }
      }
      setErrors(next);
      const first = (["title", "description", "tags"] as const).find(field => next[field]);
      if (first) ref.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    mutation.mutate(result.data);
  }

  return <dialog ref={ref} className="ih-create-dialog" aria-labelledby="create-title" onCancel={event => { event.preventDefault(); if (!mutation.isPending) onClose(); }} onClick={event => { const rect=event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && !mutation.isPending && (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)) onClose(); }}>
    <div className="ih-dialog-top"><span className="ih-eyebrow">MỘT KHỞI ĐẦU MỚI</span><button type="button" className="ih-icon-button" aria-label="Đóng" disabled={mutation.isPending} onClick={onClose}><X size={17} aria-hidden="true" /></button></div>
    <h2 id="create-title">Bạn đang nghĩ về điều gì?</h2><p className="ih-dialog-subtitle">Một vài dòng là đủ để bắt đầu cuộc trò chuyện</p>
    <form noValidate aria-busy={mutation.isPending} onSubmit={submit}>
      <label htmlFor="idea-title">Tên ý tưởng <span>*</span></label>
      <input className="ih-field" ref={titleRef} id="idea-title" name="title" value={title} disabled={mutation.isPending} aria-invalid={!!errors.title} aria-describedby={`idea-title-hint${errors.title ? " idea-title-error" : ""}`} onChange={e => { setTitle(e.target.value); clearError("title"); }} maxLength={80} placeholder="Một cái tên ngắn gọn, dễ nhớ" required />
      <div className="ih-field-meta" id="idea-title-hint"><span>Tóm gọn điều bạn muốn làm</span><span>{title.length}/80</span></div>
      {errors.title && <p id="idea-title-error" className="ih-field-error" role="alert">{errors.title}</p>}

      <label htmlFor="idea-description">Mô tả ngắn <span>*</span></label>
      <textarea className="ih-field" id="idea-description" name="description" value={description} disabled={mutation.isPending} aria-invalid={!!errors.description} aria-describedby={`idea-description-hint${errors.description ? " idea-description-error" : ""}`} onChange={e => { setDescription(e.target.value); clearError("description"); }} maxLength={240} rows={4} placeholder="Ý tưởng này giải quyết điều gì? Bạn muốn tìm ai cùng thảo luận?" required />
      <div className="ih-field-meta" id="idea-description-hint"><span>Để mọi người hiểu idea của bạn</span><span>{description.length}/240</span></div>
      {errors.description && <p id="idea-description-error" className="ih-field-error" role="alert">{errors.description}</p>}

      <div className="ih-field-label">Chủ đề</div><Select label="Chủ đề" value={category} options={CATEGORIES.map(value => ({ value, label: value }))} onChange={setCategory} wide disabled={mutation.isPending} />
      <label htmlFor="idea-tags">Tags</label>
      <input className="ih-field" id="idea-tags" name="tags" value={tags} disabled={mutation.isPending} aria-invalid={!!errors.tags} aria-describedby={`idea-tags-hint${errors.tags ? " idea-tags-error" : ""}`} onChange={e => { setTags(e.target.value); clearError("tags"); }} placeholder="Ví dụ: Python, Data crawling, Teamwork" maxLength={340} />
      <div className="ih-field-meta" id="idea-tags-hint"><span>Ngăn cách bằng dấu phẩy · tối đa 12 tags</span></div>
      {errors.tags && <p id="idea-tags-error" className="ih-field-error" role="alert">{errors.tags}</p>}

      {session.data?.storage === "memory" && <p className="ih-demo-note">Dữ liệu thử nghiệm có thể được đặt lại</p>}
      {mutation.error && <p className="ih-form-error" role="alert">{mutation.error.message}</p>}
      <div className="ih-form-footer"><button type="button" className="ih-secondary" disabled={mutation.isPending} onClick={onClose}>Để sau</button><button type="submit" className="ih-primary" disabled={mutation.isPending}>{mutation.isPending ? "Đang đăng..." : "Đăng ý tưởng"}<ArrowUpRight size={14} aria-hidden="true" /></button></div>
    </form>
  </dialog>;
}
