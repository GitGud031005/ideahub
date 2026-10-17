"use client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FilePlus2, FileText, NotebookText, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import { addDays, displayDay, localDay, periodFor, validDay, weekStart, type Recap, type RecapFile, type RecapKind, type RecapPage } from "@/lib/recaps";
import { useAuth } from "./providers";
import { Select } from "./select";
import { DatePicker } from "./date-picker";
import { geminiModelLabel } from "@/lib/gemini-models";
import { ErrorState, LoadingState } from "./status";

function RecapDialog({ children, title, onClose, className = "" }: { children: ReactNode; title: string; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null), close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current, previous = document.body.style.overflow;
    dialog?.showModal(); close.current?.focus(); document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className={`ih-recap-dialog ${className}`} aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { const rect=e.currentTarget.getBoundingClientRect(); if (e.target === e.currentTarget && (e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom)) onClose(); }}>
    <div className="ih-recap-dialog-top"><span><Sparkles size={13} aria-hidden="true"/>AI RECAP</span><button ref={close} type="button" className="ih-icon-button" aria-label="Đóng recap" onClick={onClose}><X size={18} aria-hidden="true"/></button></div>
    {children}
  </dialog>;
}
function RecapReader({ ideaId, file, onClose, onReveal }: { ideaId: string; file: RecapFile; onClose: () => void; onReveal: (id: string) => void }) {
  const query = useQuery({ queryKey: ["recap", ideaId, file.id, file.updatedAt], queryFn: ({ signal }) => api<Recap>(`/ideas/${encodeURIComponent(ideaId)}/recaps/${encodeURIComponent(file.id)}`, { signal }) });
  const sections = [
    { key: "keyIdeas", title: "Ý tưởng chính", empty: "Chưa có ý tưởng được ghi nhận" },
    { key: "decisions", title: "Quyết định", empty: "Chưa có quyết định được thống nhất trong kỳ này" },
    { key: "nextSteps", title: "Việc tiếp theo", empty: "Chưa có công việc tiếp theo được xác nhận" },
    { key: "openQuestions", title: "Câu hỏi còn mở", empty: "Không ghi nhận câu hỏi còn mở" },
  ] as const;
  return <RecapDialog title={file.fileName} onClose={onClose}>
    <header className="ih-recap-reader-header"><span className="ih-recap-kind">{file.kind === "daily" ? "Bản ngày" : "Bản tuần"}{file.source === "sample" && <span className="ih-recap-sample">Mẫu · biên soạn sẵn</span>}</span>
      <h2>{file.fileName}</h2><p>{displayDay(file.periodStart)}{file.kind === "weekly" && ` — ${displayDay(addDays(file.periodEnd, -1))}`}<span>·</span>{file.sourceCount} bình luận<span>·</span>Giờ Việt Nam</p>
    </header>
    <div className="ih-recap-reader-body">
      {query.isPending ? <LoadingState label="Đang mở bản recap..."/> : query.error ? <ErrorState error={query.error} retry={() => { query.refetch(); }}/> : query.data && sections.map(section => <section className="ih-recap-section" key={section.key}><h3>{section.title}</h3>
        {query.data.content[section.key].length ? <ul>{query.data.content[section.key].map((bullet, i) => <li key={i}><p>{bullet.text}</p><button type="button" className="ih-recap-evidence" onClick={() => { onClose(); onReveal(bullet.commentIds[0]); }}>{bullet.commentIds.length} bình luận nguồn</button></li>)}</ul> : <p className="ih-recap-empty-section">{section.empty}</p>}
      </section>)}
    </div>
    <footer className="ih-recap-reader-footer"><span>{file.source === "sample" ? "Bản mẫu để xem trước bố cục recap" : `${file.model?geminiModelLabel(file.model):"AI tổng hợp"} · đối chiếu bình luận nguồn khi cần`}</span><time dateTime={file.updatedAt}>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(file.updatedAt))}</time></footer>
  </RecapDialog>;
}
function CreateRecap({ ideaId, onClose, onCreated }: { ideaId: string; onClose: () => void; onCreated: (file: RecapFile) => void }) {
  const [kind, setKind] = useState<RecapKind>("daily"), [date, setDate] = useState(() => addDays(localDay(), -1)), client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => api<Recap>(`/ideas/${encodeURIComponent(ideaId)}/recaps`, { method: "POST", body: JSON.stringify({ kind, date }) }), onSuccess: file => { client.invalidateQueries({ queryKey: ["recaps", ideaId] }); onCreated(file); } });
  const period = validDay(date) ? periodFor(kind, date) : null;
  return <RecapDialog title="Tạo bản recap" onClose={() => { if (!mutation.isPending) onClose(); }} className="ih-recap-create">
    <h2>Tóm lại những điều quan trọng</h2><p className="ih-recap-create-intro">Giữ lại ý tưởng, quyết định và bước đi tiếp theo từ cuộc thảo luận</p>
    <form noValidate onSubmit={e => { e.preventDefault(); if (validDay(date) && !mutation.isPending) mutation.mutate(); }}>
      <div className="ih-field-label">Loại recap</div><Select label="Loại recap" value={kind} onChange={value => { setKind(value); mutation.reset(); }} wide disabled={mutation.isPending} options={[{ value: "daily", label: "Theo ngày" }, { value: "weekly", label: "Theo tuần" }]}/>
      <label htmlFor="recap-date">{kind === "daily" ? "Ngày thảo luận" : "Chọn một ngày trong tuần"}</label><DatePicker id="recap-date" label={kind === "daily" ? "Ngày thảo luận" : "Ngày trong tuần"} value={date} min="2020-01-01" max={localDay()} disabled={mutation.isPending} onChange={value => { setDate(value); mutation.reset(); }}/>
      {period && <p className="ih-recap-period">{displayDay(period.start)}{kind === "weekly" && ` — ${displayDay(addDays(period.end, -1))}`} · Giờ Việt Nam</p>}
      {mutation.error && <p className="ih-form-error" role="alert">{mutation.error.message}</p>}
      <div className="ih-form-footer"><button type="button" className="ih-secondary" disabled={mutation.isPending} onClick={onClose}>Để sau</button><button type="submit" className="ih-primary" disabled={!date || mutation.isPending}>{mutation.isPending ? "Đang tổng hợp..." : "Tạo recap"}</button></div>
    </form>
  </RecapDialog>;
}
function RecapWeek({ start, files, initialOpen, onOpen }: { start: string; files: RecapFile[]; initialOpen: boolean; onOpen: (file: RecapFile) => void }) {
  const [open, setOpen] = useState(initialOpen);
  return <div className="ih-recap-week"><button type="button" className="ih-recap-week-toggle" aria-expanded={open} aria-controls={`recap-week-${start}`} onClick={() => setOpen(!open)}><ChevronDown size={13} className={open ? "is-open" : ""} aria-hidden="true"/><span>Tuần {displayDay(start).slice(0, 5)} — {displayDay(addDays(start, 6)).slice(0, 5)}<small>{start.slice(0, 4)}</small></span><span className="ih-recap-file-count">{files.length}</span></button>
    <div className="ih-recap-week-files" id={`recap-week-${start}`} hidden={!open}>{files.map(file => <button type="button" key={file.id} className={`ih-recap-file${file.kind === "weekly" ? " ih-recap-file-weekly" : ""}`} onClick={() => onOpen(file)}>
      {file.kind === "weekly" ? <NotebookText size={16} aria-hidden="true"/> : <FileText size={16} aria-hidden="true"/>}<span><span className="ih-recap-file-name">{file.fileName}</span><span className="ih-recap-file-meta">{file.kind === "weekly" ? "Tổng kết tuần" : "Tổng kết ngày"}{file.source === "sample" && " · Mẫu"}</span></span>
    </button>)}</div>
  </div>;
}
export function RecapFiles({ ideaId, onReveal }: { ideaId: string; onReveal: (id: string) => void }) {
  const { user, requestLogin } = useAuth(), [selected, setSelected] = useState<RecapFile | null>(null), [creating, setCreating] = useState(false);
  const query = useInfiniteQuery({ queryKey: ["recaps", ideaId, user?.id], queryFn: ({ signal, pageParam }) => api<RecapPage>(`/ideas/${encodeURIComponent(ideaId)}/recaps?offset=${pageParam}`, { signal }), initialPageParam: 0, getNextPageParam: page => page.nextOffset ?? undefined, enabled: !!user, refetchInterval: 30000 });
  const groups = useMemo(() => {
    const weeks = new Map<string, RecapFile[]>(), seen = new Set<string>();
    for (const page of query.data?.pages ?? []) for (const file of page.items) {
      if (seen.has(file.id)) continue; seen.add(file.id);
      const week = weekStart(file.periodStart); if (!weeks.has(week)) weeks.set(week, []); weeks.get(week)!.push(file);
    }
    return [...weeks].sort(([a], [b]) => b.localeCompare(a)).map(([start, files]) => ({ start, files: files.sort((a, b) => a.kind !== b.kind ? a.kind === "weekly" ? -1 : 1 : b.periodStart.localeCompare(a.periodStart)) }));
  }, [query.data]);
  const configured = !!query.data?.pages[0]?.aiConfigured;
  return <section className="ih-recaps" aria-label="Tệp AI recap"><div className="ih-recaps-heading"><span><Sparkles size={13} aria-hidden="true"/>AI RECAP</span>{user && <button type="button" className="ih-recap-add" aria-label="Tạo bản recap" title={configured ? "Tạo bản recap theo ngày hoặc tuần" : "AI recap chưa được kết nối"} disabled={!configured || query.isPending} onClick={() => setCreating(true)}><FilePlus2 size={16} aria-hidden="true"/></button>}</div>
    <p className="ih-recaps-caption">Điểm lại ý tưởng, giữ nhịp cùng nhau</p>
    {!user ? <button type="button" className="ih-recap-login" onClick={() => requestLogin()}>Đăng nhập để xem recap</button> : query.isPending ? <p className="ih-recaps-note">Đang tải các bản recap...</p> : query.error ? <div className="ih-recaps-note" role="alert">Chưa tải được recap<button type="button" onClick={() => { query.refetch(); }}>Thử lại</button></div> : <>
      {!groups.length && <p className="ih-recaps-note">Các bản tổng kết ngày và tuần sẽ được lưu ở đây</p>}
      {groups.map((group, i) => <RecapWeek key={group.start} {...group} initialOpen={i === 0} onOpen={setSelected}/>)}
      {query.hasNextPage && <button type="button" className="ih-recap-load" disabled={query.isFetchingNextPage} onClick={() => { query.fetchNextPage(); }}>{query.isFetchingNextPage ? "Đang tải..." : "Các tuần trước"}</button>}
      {!configured && <p className="ih-recaps-note ih-recaps-offline">Recap tự động chưa bật</p>}
    </>}
    {selected && <RecapReader ideaId={ideaId} file={selected} onClose={() => setSelected(null)} onReveal={onReveal}/>}
    {creating && <CreateRecap ideaId={ideaId} onClose={() => setCreating(false)} onCreated={file => { setCreating(false); setSelected(file); }}/>} 
  </section>;
}
