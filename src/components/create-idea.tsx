"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ArrowUpRight, Sparkles, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { CreateIdeaInput, Idea } from "@/lib/domain";
import { TagPicker } from "./tag-picker";
import { createIdeaSchema, tagSuggestionInputSchema } from "@/lib/validation";
import { useSession } from "./providers";

type FieldName = "title" | "description" | "tags";
type FieldErrors = Partial<Record<FieldName, string>>;

export function CreateIdea({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), titleRef = useRef<HTMLInputElement>(null), client = useQueryClient(), router = useRouter();
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [tags, setTags] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const session = useSession(),revision=useRef(0),mounted=useRef(true);
  const [suggestionNote,setSuggestionNote]=useState("");
  const suggest=useMutation({
    mutationFn:({title,description}: {title:string;description:string;revision:number})=>api<{tags:string[];model:string}>("/ideas/suggest-tags",{method:"POST",body:JSON.stringify({title,description})}),
    onSuccess:(result,input)=>{
      if(!mounted.current)return;
      if(revision.current!==input.revision){setSuggestionNote("Nội dung hoặc tags đã thay đổi, bấm gợi ý lại để dùng bản mới nhất");return;}
      setTags(result.tags);setSuggestionNote("Đã cập nhật tags theo gợi ý AI, bạn có thể bỏ hoặc chọn thêm trước khi đăng");clearError("tags");
    },
  });
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  function edited(){revision.current++;setSuggestionNote("");if(suggest.isError)suggest.reset();}
  function suggestTags(){
    const parsed=tagSuggestionInputSchema.safeParse({title,description});
    if(!parsed.success){
      const next:FieldErrors={};for(const issue of parsed.error.issues){const field=issue.path[0];if(field==="title"||field==="description")next[field]??=issue.message;}
      setErrors(next);const first=next.title?"title":"description";ref.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[name="${first}"]`)?.focus();return;
    }
    setSuggestionNote("");suggest.mutate({...parsed.data,revision:revision.current});
  }
  const mutation = useMutation({ mutationFn: (body: CreateIdeaInput) => api<Idea>("/ideas", { method: "POST", body: JSON.stringify(body) }), onSuccess: idea => { client.invalidateQueries({ queryKey: ["ideas"] }); client.setQueryData(["idea", idea.id], idea); onClose(); router.push(`/ideas/${idea.id}`); } });
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); titleRef.current?.focus(); const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { dialog?.close(); document.body.style.overflow = previous; }; }, []);

  function clearError(field: FieldName) {
    setErrors(current => { if (!current[field]) return current; const next = { ...current }; delete next[field]; return next; });
    if (mutation.isError) mutation.reset();
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || suggest.isPending) return;
    const result = createIdeaSchema.safeParse({ title, description, tags });
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field === "title" || field === "description" || field === "tags") {
          next[field] ??= field === "tags" ? "Chọn tối đa 12 tags trong danh mục có sẵn" : issue.message;
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
      <input className="ih-field" ref={titleRef} id="idea-title" name="title" value={title} disabled={mutation.isPending} aria-invalid={!!errors.title} aria-describedby={`idea-title-hint${errors.title ? " idea-title-error" : ""}`} onChange={e => { setTitle(e.target.value); edited(); clearError("title"); }} maxLength={80} placeholder="Một cái tên ngắn gọn, dễ nhớ" required />
      <div className="ih-field-meta" id="idea-title-hint"><span>Tóm gọn điều bạn muốn làm</span><span>{title.length}/80</span></div>
      {errors.title && <p id="idea-title-error" className="ih-field-error" role="alert">{errors.title}</p>}

      <label htmlFor="idea-description">Mô tả ngắn <span>*</span></label>
      <textarea className="ih-field" id="idea-description" name="description" value={description} disabled={mutation.isPending} aria-invalid={!!errors.description} aria-describedby={`idea-description-hint${errors.description ? " idea-description-error" : ""}`} onChange={e => { setDescription(e.target.value); edited(); clearError("description"); }} maxLength={240} rows={4} placeholder="Ý tưởng này giải quyết điều gì? Bạn muốn tìm ai cùng thảo luận?" required />
      <div className="ih-field-meta" id="idea-description-hint"><span>Để mọi người hiểu idea của bạn</span><span>{description.length}/240</span></div>
      {errors.description && <p id="idea-description-error" className="ih-field-error" role="alert">{errors.description}</p>}

      <div className="ih-field-label" id="idea-tags-label">Tags</div>
      <TagPicker value={tags} onChange={value=>{setTags(value);edited();clearError("tags");}} disabled={mutation.isPending} error={errors.tags}/>
      <div className="ih-ai-tags"><button type="button" className="ih-secondary ih-suggest-tags" disabled={mutation.isPending||suggest.isPending} onClick={suggestTags}>{suggest.isPending?<LoaderCircle className="ih-ai-spinner" size={14} aria-hidden="true"/>:<Sparkles size={14} aria-hidden="true"/>}{suggest.isPending?"Đang chọn tags phù hợp...":"Gợi ý tags bằng AI"}</button><p>AI đọc tên và mô tả để cập nhật các tags đang chọn</p></div>
      {suggestionNote&&<p className="ih-ai-tags-note" role="status">{suggestionNote}</p>}
      {suggest.error&&<p className="ih-field-error" role="alert" data-ai-error-code={suggest.error instanceof ApiError?suggest.error.code:undefined}>{suggest.error.message}. Bạn vẫn có thể tự chọn tags</p>}

      {session.data?.storage === "memory" && <p className="ih-demo-note">Dữ liệu thử nghiệm có thể được đặt lại</p>}
      {mutation.error && <p className="ih-form-error" role="alert">{mutation.error.message}</p>}
      <div className="ih-form-footer"><button type="button" className="ih-secondary" disabled={mutation.isPending} onClick={onClose}>Để sau</button><button type="submit" className="ih-primary" disabled={mutation.isPending||suggest.isPending}>{mutation.isPending ? "Đang đăng..." : "Đăng ý tưởng"}<ArrowUpRight size={14} aria-hidden="true" /></button></div>
    </form>
  </dialog>;
}
