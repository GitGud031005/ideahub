"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PanelRightOpen, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, fetchComments } from "@/lib/api-client";
import type { Comment, CommentSort, CreateCommentInput, Idea } from "@/lib/domain";
import { buildCommentForest, relativeTime } from "@/lib/format";
import { CommentEditor } from "./comment-editor";
import { Avatar } from "./avatar";
import { CommentTree } from "./comment-tree";
import { useAuth, useSession, useUi } from "./providers";
import { Select } from "./select";
import { RecapFiles } from "./recap-files";
import { ErrorState, LoadingState } from "./status";

export function Discussion({ id }: { id: string }) {
  const session = useSession(), { user, requestLogin } = useAuth(), client = useQueryClient(), { sidebarOpen, setSidebarOpen, setDrafts } = useUi();
  const [sort, setSort] = useState<CommentSort>("old"), [target, setTarget] = useState<string | null>(null), [expanded, setExpanded] = useState<Set<string>>(() => new Set()), [status, setStatus] = useState("");
  const reveal = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null), joinAttempted = useRef(false);
  const [mobile, setMobile] = useState(false);
  const idea = useQuery({ queryKey: ["idea", id], queryFn: ({ signal }) => api<Idea>(`/ideas/${encodeURIComponent(id)}`, { signal }), enabled: !!session.data, refetchInterval: 15000 });
  const comments = useQuery({ queryKey: ["comments", id], queryFn: ({ signal }) => fetchComments(id, signal), enabled: !!user && !!idea.data, refetchInterval: 15000 });
  const join = useMutation({ mutationFn: () => api<Idea>(`/ideas/${encodeURIComponent(id)}/join`, { method: "POST" }), onSuccess: joined => { client.setQueryData(["idea", id], joined); client.invalidateQueries({ queryKey: ["ideas"] }); } });
  useEffect(() => { joinAttempted.current = false; }, [id, user?.id]);
  useEffect(() => { if (user && idea.data && !idea.data.joined && !joinAttempted.current) { joinAttempted.current = true; join.mutate(); } }, [user, idea.data, join]);
  useEffect(() => {
    const media=window.matchMedia("(max-width: 760px)");
    const change=()=>{setMobile(media.matches);if(media.matches)setSidebarOpen(false);};
    change();media.addEventListener("change",change);return()=>media.removeEventListener("change",change);
  }, [setSidebarOpen]);
  useEffect(() => {
    if (!mobile || !sidebarOpen) return;
    close.current?.focus({preventScroll:true});
    const keyboard=(event:KeyboardEvent)=>{
      if(document.querySelector("dialog[open]"))return;
      if(event.key==="Escape"){event.preventDefault();setSidebarOpen(false);requestAnimationFrame(()=>reveal.current?.focus());}
      if(event.key!=="Tab")return;
      const buttons=[...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')??[])].filter(el=>el.getClientRects().length>0);
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",keyboard);return()=>document.removeEventListener("keydown",keyboard);
  },[mobile,sidebarOpen,setSidebarOpen]);
  const tree = useMemo(() => buildCommentForest(comments.data ?? [], sort), [comments.data, sort]);
  const create = useMutation({
    mutationFn: (input: CreateCommentInput) => api<Comment>(`/ideas/${encodeURIComponent(id)}/comments`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: comment => {
      client.setQueryData<Comment[]>(["comments", id], current => current?.some(c => c.id === comment.id) ? current : [...(current ?? []), comment]);
      setDrafts(current => { const next = { ...current }; delete next[comment.parentId ? `reply:${id}:${comment.parentId}` : `comment:${id}`]; return next; });
      if (comment.parentId) {
        setTarget(null); setExpanded(current => { const next = new Set(current), seen = new Set<string>(); let parent: string | null = comment.parentId; while (parent && !seen.has(parent)) { seen.add(parent); next.add(parent); parent = comments.data?.find(c => c.id === parent)?.parentId ?? null; } return next; });
      }
      setStatus(comment.parentId ? "Đã đăng trả lời" : "Đã đăng bình luận");
      client.invalidateQueries({ queryKey: ["idea", id] }); client.invalidateQueries({ queryKey: ["ideas"] });
      requestAnimationFrame(() => { if (comment.parentId) document.getElementById(`reply-button-${comment.parentId}`)?.focus({ preventScroll: true }); document.getElementById(`comment-${comment.id}`)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); });
    },
  });
  function toggleSidebar(open: boolean) { setSidebarOpen(open); requestAnimationFrame(() => (open ? close : reveal).current?.focus({ preventScroll: true })); }
  function revealComment(commentId: string) {
    setExpanded(current => {
      const next = new Set(current), seen = new Set<string>();
      let parent = comments.data?.find(c => c.id === commentId)?.parentId;
      while (parent && !seen.has(parent)) { seen.add(parent); next.add(parent); parent = comments.data?.find(c => c.id === parent)?.parentId; }
      return next;
    });
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    requestAnimationFrame(() => { document.getElementById(`comment-${commentId}`)?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); });
  }
  const error = session.error || idea.error;
  return <main className="ih-discussion" aria-labelledby="discussion-title"><section className={`ih-discussion-page${!sidebarOpen ? " ih-aside-collapsed" : ""}`}>
    <header className="ih-discussion-header" inert={mobile && sidebarOpen}><div className="ih-discussion-heading"><Link className="ih-thread-back" href="/" scroll={false} aria-label="Quay lại bảng ý tưởng"><ChevronLeft size={16} aria-hidden="true"/></Link><h1 id="discussion-title">Thảo luận <span className="ih-comment-count">{comments.data?.length ?? idea.data?.commentCount ?? "—"}</span></h1></div><div className="ih-discussion-actions"><div className="ih-discussion-sort"><span className="ih-sort-caption">Sắp xếp</span><Select label="Sắp xếp bình luận" value={sort} onChange={setSort} disabled={!idea.data} options={[{ value: "old", label: "Cũ nhất" }, { value: "new", label: "Mới nhất" }]}/></div>{!sidebarOpen && <button ref={reveal} className="ih-about-toggle" aria-label="Mở thanh thông tin ý tưởng" aria-controls="idea-panel" aria-expanded={false} onClick={() => toggleSidebar(true)}><PanelRightOpen size={17} aria-hidden="true"/></button>}</div></header>
    <button type="button" className="ih-aside-scrim" hidden={!sidebarOpen} aria-label="Đóng thanh thông tin ý tưởng" onClick={() => toggleSidebar(false)}/>
    <div className="ih-thread-layout"><div className="ih-thread-main" inert={mobile && sidebarOpen}><section className="ih-thread-comments" aria-label="Nội dung thảo luận">
      {error ? <ErrorState error={error} retry={() => { session.refetch(); idea.refetch(); }}/> : !idea.data ? <LoadingState label="Đang mở thảo luận..."/> : <>
        {join.error && <div className="ih-inline-error" role="alert">{join.error.message}<button className="ih-reply-button" onClick={() => join.mutate()} disabled={join.isPending}>Thử tham gia lại</button></div>}
        {!user ? <div className="ih-thread-login"><h2>Cùng góp một góc nhìn</h2><p>Đăng nhập để tham gia cuộc thảo luận này</p><button className="ih-primary" type="button" onClick={() => requestLogin()}>Đăng nhập để tham gia</button></div> : comments.error ? <ErrorState error={comments.error} retry={() => { comments.refetch(); }}/> : comments.isPending ? <LoadingState label="Đang tải bình luận..."/> : !comments.data?.length ? <p className="ih-thread-empty">Cuộc thảo luận đang chờ góc nhìn đầu tiên của bạn</p> : <CommentTree ideaId={id} creatorId={idea.data.creator.id} userId={user.id} children={tree} expanded={expanded} toggle={commentId => setExpanded(current => { const next = new Set(current); if (next.has(commentId)) next.delete(commentId); else next.add(commentId); return next; })} target={target} setTarget={setTarget} pending={create.isPending} error={create.error?.message} errorParent={create.variables?.parentId ?? null} submit={(text, parentId) => create.mutate({ text, parentId })}/>}
      </>}
      <p className="ih-sr" role="status" aria-live="polite">{status}</p>
    </section>{idea.data && user && <CommentEditor draftKey={`comment:${id}`} label="Thêm góc nhìn của bạn" pending={create.isPending} error={!create.variables?.parentId ? create.error?.message : undefined} onSubmit={text => create.mutate({ text })}/>}</div>
    <aside ref={panel} hidden={!sidebarOpen} className="ih-thread-aside" id="idea-panel" role={mobile && sidebarOpen ? "dialog" : undefined} aria-modal={mobile && sidebarOpen ? true : undefined} aria-label="Thông tin ý tưởng"><div className="ih-about-top"><span className="ih-about-label">VỀ Ý TƯỞNG NÀY</span><button ref={close} className="ih-about-close" aria-label="Thu gọn thông tin ý tưởng" aria-controls="idea-panel" aria-expanded={true} onClick={() => toggleSidebar(false)}><X size={15} aria-hidden="true"/></button></div>{idea.data ? <><h2 id="idea-title">{idea.data.title}</h2><p className="ih-thread-description">{idea.data.description}</p><div className="ih-about-divider"/><div className="ih-about-label">NGƯỜI KHỞI XƯỚNG</div><div className="ih-post-byline"><Avatar person={idea.data.creator}/><div><span className="ih-thread-owner">{idea.data.creator.name}</span><time dateTime={idea.data.createdAt}>Tạo {relativeTime(idea.data.createdAt)}</time></div></div><div className="ih-about-divider"/><div className="ih-about-members"><strong>{idea.data.memberCount}</strong><span>người tham gia</span></div><div className="ih-about-divider"/><div className="ih-about-label">TAGS</div><div className="ih-about-tags">{idea.data.tags.map(tag => <span key={tag} className="ih-tag">{tag}</span>)}</div><div className="ih-about-divider"/><RecapFiles key={`${id}:${user?.id ?? "guest"}`} ideaId={id} onReveal={revealComment}/><span className="ih-thread-side-brand">ideahub.</span></>: <p className="ih-thread-empty">{error ? "Thông tin chưa có sẵn" : "Đang tải thông tin..."}</p>}</aside>
    </div>
  </section></main>;
}
