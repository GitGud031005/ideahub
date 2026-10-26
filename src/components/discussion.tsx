"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PanelRightOpen, X, Search, ArrowDown, Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, fetchComments } from "@/lib/api-client";
import type { Author, Mention, Attachment, Comment, CommentSort, Idea } from "@/lib/domain";
import { buildCommentForest, relativeTime } from "@/lib/format";
import { mergeComments } from "@/lib/comment-outbox";
import { useCommentOutbox } from "./use-comment-outbox";
import { useReadComments } from "./use-read-comments";
import { useLiveComments } from "./use-live-comments";
import { CommentEditor } from "./comment-editor";
import { Avatar } from "./avatar";
import { CommentTree } from "./comment-tree";
import { useAuth, useSession, useUi } from "./providers";
import { IdeaStatusControl } from "./idea-status";
import { Select } from "./select";
import { RecapFiles } from "./recap-files";
import { ErrorState, LoadingState } from "./status";
import { SharedFiles } from "./shared-files";
import { AttachmentViewer } from "./attachment-view";
import {RoomSearch} from "./room-search";
import {NotificationBell} from "./notification-bell";
import {useRoomFeed} from "./use-room-feed";

export function Discussion({ id,requestedComment }: { id: string;requestedComment?:string }) {
  const session = useSession(), { user, requestLogin } = useAuth(), client = useQueryClient(), { sidebarOpen, setSidebarOpen } = useUi();
  const [sort, setSort] = useState<CommentSort>("old"), [target, setTarget] = useState<string | null>(null), [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const reveal = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null), joinAttempted = useRef(false);
  const [mobile, setMobile] = useState(false),[selectedImage,setSelectedImage]=useState<Attachment|null>(null);
  const [searchOpen,setSearchOpen]=useState(false),[navigationError,setNavigationError]=useState("");
  const anchor=useRef<{id:string;top:number}|null>(null),searchButton=useRef<HTMLButtonElement>(null);
  const scrollBox = useRef<HTMLElement>(null), followLatest = useRef(true), previousSort = useRef(sort);
  const idea = useQuery({ queryKey: ["idea", id], queryFn: ({ signal }) => api<Idea>(`/ideas/${encodeURIComponent(id)}`, { signal }), enabled: !!session.data, refetchInterval: 15000 });
  const liveInterval = useLiveComments(id, user?.id, !!idea.data);
  const comments = useQuery({ queryKey: ["comments", id, user?.id], queryFn: ({ signal }) => fetchComments(id, signal), enabled: !!user && !!idea.data, refetchInterval: liveInterval, refetchOnWindowFocus: "always", refetchOnReconnect: "always" });
  const members=useQuery({queryKey:["room-members",id,user?.id],queryFn:({signal})=>api<Author[]>(`/ideas/${encodeURIComponent(id)}/members`,{signal}),enabled:!!user&&!!idea.data,refetchInterval:30000});
  const settings=useQuery({queryKey:["room-notification-settings",id,user?.id],queryFn:({signal})=>api<{muted:boolean}>(`/ideas/${encodeURIComponent(id)}/notification-settings`,{signal}),enabled:!!user&&!!idea.data?.joined});
  const mute=useMutation({mutationFn:(muted:boolean)=>api<{muted:boolean}>(`/ideas/${encodeURIComponent(id)}/notification-settings`,{method:"POST",body:JSON.stringify({muted})}),onSuccess:result=>client.setQueryData(["room-notification-settings",id,user?.id],result)});
  const feed=useRoomFeed(comments.data,user?.id,followLatest);
  async function editComment(commentId:string,text:string,mentions:Mention[],revision:number){const updated=await api<Comment>(`/ideas/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/edit`,{method:"POST",body:JSON.stringify({text,mentions,revision})});client.setQueryData<Comment[]>(["comments",id,user?.id],current=>current?.map(c=>c.id===commentId?updated:c));void client.invalidateQueries({queryKey:["room-search",id]});void client.invalidateQueries({queryKey:["notifications"]});return updated;}
  const unreadComments=useReadComments(id,user?.id,!!idea.data?.joined,comments.data,expanded,!mobile||!sidebarOpen);
  const pin=useMutation({
    mutationFn:({commentId,pinned}:{commentId:string;pinned:boolean})=>api(`/ideas/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/pin`,{method:"POST",body:JSON.stringify({pinned})}),
    onSuccess:(_result,{commentId,pinned})=>{client.setQueryData<Comment[]>(["comments",id,user?.id],current=>current?.map(c=>c.id===commentId?{...c,pinnedAt:pinned?new Date().toISOString():null}:c));void client.invalidateQueries({queryKey:["comments",id,user?.id]});},
  });
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
  const outbox=useCommentOutbox(id,user);
  const sending=outbox.items.filter(c=>c.delivery==="sending").length;
  const status=sending?`Đang gửi ${sending} bình luận`:outbox.items.some(c=>c.delivery==="failed")?"Có bình luận chưa gửi được":"";
  const thread=useMemo(()=>mergeComments(feed.items,outbox.items),[feed.items,outbox.items]);
  const tree=useMemo(()=>buildCommentForest(thread,sort),[thread,sort]);
  useLayoutEffect(() => { followLatest.current = true; }, [id]);
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (previousSort.current !== sort) {
      previousSort.current = sort;
      if (box) { box.scrollTop = 0; followLatest.current = sort==="new"||box.scrollHeight <= box.clientHeight + 96; }
      return;
    }
    if(box){if(sort==="old"&&followLatest.current)box.scrollTop=box.scrollHeight;else if(!followLatest.current&&anchor.current){const el=document.getElementById(anchor.current.id);if(el)box.scrollTop+=el.getBoundingClientRect().top-anchor.current.top;}}
  }, [thread, sort]);
  function submit(text:string,parentId:string|null=null,files:File[]=[],mentions:Mention[]=[]){
    const entry=outbox.enqueue(text,parentId,files,mentions);if(!entry)return;
    if(parentId)setExpanded(current=>{const next=new Set(current),seen=new Set<string>();let parent:string|null=parentId;while(parent&&!seen.has(parent)){seen.add(parent);next.add(parent);parent=thread.find(c=>c.id===parent)?.parentId??null;}return next;});
    if(!parentId)requestAnimationFrame(()=>document.getElementById(`comment-${entry.id}`)?.scrollIntoView({block:"nearest",behavior:"instant"}));
  }
  function toggleSidebar(open: boolean) { setSidebarOpen(open); requestAnimationFrame(() => (open ? close : reveal).current?.focus({ preventScroll: true })); }
  function revealComment(commentId: string) {
    followLatest.current=false;feed.release();setNavigationError("");
    setExpanded(current => {
      const next = new Set(current), seen = new Set<string>();
      let parent = comments.data?.find(c => c.id === commentId)?.parentId;
      while (parent && !seen.has(parent)) { seen.add(parent); next.add(parent); parent = comments.data?.find(c => c.id === parent)?.parentId; }
      return next;
    });
    if (window.matchMedia("(max-width: 760px)").matches) setSidebarOpen(false);
    requestAnimationFrame(() => { const el=document.getElementById(`comment-${commentId}`);el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });el?.focus({preventScroll:true});if(el)anchor.current={id:el.id,top:el.getBoundingClientRect().top};else setNavigationError("Bình luận không còn có sẵn. Hãy tải lại cuộc thảo luận");if(el&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)el.animate([{background:"#eeeeea"},{background:"transparent"}],{duration:1800}); });
  }
  const deepLinkDone=useRef("");
  useEffect(()=>{if(!requestedComment||!comments.data||deepLinkDone.current===requestedComment)return;deepLinkDone.current=requestedComment;if(comments.data.some(c=>c.id===requestedComment))revealComment(requestedComment);else setNavigationError("Bình luận không còn có sẵn trong cuộc thảo luận này");},[requestedComment,comments.data]);
  useEffect(()=>{const handler=(event:MessageEvent)=>{if(event.data?.type!=="CHECK_COMMENT")return;const el=document.getElementById(`comment-${event.data.commentId}`),box=scrollBox.current,a=el?.getBoundingClientRect(),b=box?.getBoundingClientRect();event.ports[0]?.postMessage({visible:!!user&&user.id===event.data.userId&&!document.hidden&&document.hasFocus()&&!!el?.getClientRects().length&&!!a&&!!b&&a.bottom>b.top&&a.top<b.bottom&&!(mobile&&sidebarOpen),userId:user?.id??null});};navigator.serviceWorker?.addEventListener("message",handler);return()=>navigator.serviceWorker?.removeEventListener("message",handler);},[user,mobile,sidebarOpen]);
  function recordScroll(){const box=scrollBox.current;if(!box)return;followLatest.current=sort==="old"?box.scrollHeight-box.scrollTop-box.clientHeight<96:box.scrollTop<96;const top=box.getBoundingClientRect().top;const el=[...box.querySelectorAll<HTMLElement>("article.ih-comment")].find(el=>el.getBoundingClientRect().bottom>top+5);if(el)anchor.current={id:el.id,top:el.getBoundingClientRect().top};}
  const error = session.error || idea.error;
  return <main className="ih-discussion" aria-labelledby="discussion-title"><section className={`ih-discussion-page${!sidebarOpen ? " ih-aside-collapsed" : ""}`}>
    <header className="ih-discussion-header" inert={mobile && sidebarOpen}><div className="ih-discussion-heading"><Link className="ih-thread-back" href="/" scroll={false} aria-label="Quay lại bảng ý tưởng"><ChevronLeft size={16} aria-hidden="true"/></Link><h1 id="discussion-title">Thảo luận <span className="ih-comment-count">{comments.data?mergeComments(comments.data,outbox.items).length:(idea.data?.commentCount??0)+outbox.items.length}</span></h1></div><div className="ih-discussion-actions"><NotificationBell/>{user&&<button ref={searchButton} className="ih-about-toggle" aria-label="Tìm trong phòng" aria-expanded={searchOpen} onClick={()=>{setSearchOpen(true);setSidebarOpen(true);}}><Search size={17}/></button>}<div className="ih-discussion-sort"><span className="ih-sort-caption">Sắp xếp</span><Select label="Sắp xếp bình luận" value={sort} onChange={setSort} disabled={!idea.data} options={[{ value: "old", label: "Cũ nhất" }, { value: "new", label: "Mới nhất" }]}/></div>{!sidebarOpen && <button ref={reveal} className="ih-about-toggle" aria-label="Mở thanh thông tin ý tưởng" aria-controls="idea-panel" aria-expanded={false} onClick={() => toggleSidebar(true)}><PanelRightOpen size={17} aria-hidden="true"/></button>}</div></header>
    <button type="button" className="ih-aside-scrim" hidden={!sidebarOpen} aria-label="Đóng thanh thông tin ý tưởng" onClick={() => toggleSidebar(false)}/>
    <div className="ih-thread-layout"><div className="ih-thread-main" inert={mobile && sidebarOpen}><section ref={scrollBox} className="ih-thread-comments" aria-label="Nội dung thảo luận" onScroll={() => { const box = scrollBox.current; if (box) followLatest.current = sort==="old"?box.scrollHeight-box.scrollTop-box.clientHeight<96:box.scrollTop<96;recordScroll(); }}>
      {error ? <ErrorState error={error} retry={() => { session.refetch(); idea.refetch(); }}/> : !idea.data ? <LoadingState label="Đang mở thảo luận..."/> : <>
        {navigationError&&<p className="ih-inline-error" role="alert">{navigationError}</p>}{mute.error&&<p className="ih-inline-error" role="alert">{mute.error.message}</p>}{pin.error&&<p className="ih-inline-error" role="alert">{pin.error.message}</p>}
        {join.error && <div className="ih-inline-error" role="alert">{join.error.message}<button className="ih-reply-button" onClick={() => join.mutate()} disabled={join.isPending}>Thử tham gia lại</button></div>}
        {!user ? <div className="ih-thread-login"><h2>Cùng góp một góc nhìn</h2><p>Đăng nhập để tham gia cuộc thảo luận này</p><button className="ih-primary" type="button" onClick={() => requestLogin(undefined,window.location.pathname+window.location.search)}>Đăng nhập để tham gia</button></div> : comments.error && !thread.length ? <ErrorState error={comments.error} retry={() => { comments.refetch(); }}/> : comments.isPending && !thread.length ? <LoadingState label="Đang tải bình luận..."/> : !thread.length ? <p className="ih-thread-empty">Cuộc thảo luận đang chờ góc nhìn đầu tiên của bạn</p> : <CommentTree members={members.data??[]} onEdit={editComment} revise={outbox.revise} unread={unreadComments} ideaId={id} creatorId={idea.data.creator.id} userId={user.id} children={tree} expanded={expanded} toggle={commentId => setExpanded(current => { const next = new Set(current); if (next.has(commentId)) next.delete(commentId); else next.add(commentId); return next; })} target={target} setTarget={setTarget} retry={outbox.retry} dismiss={outbox.dismiss} submit={submit} canPin={!!idea.data.joined} pinPending={pin.isPending?pin.variables?.commentId:undefined} onPin={(commentId,pinned)=>pin.mutate({commentId,pinned})} onImage={setSelectedImage}/>}
      </>}
      <p className="ih-sr" role="status" aria-live="polite">{status}</p>
    </section>{feed.queued.length>0&&<button className="ih-new-messages" onClick={()=>{const first=feed.release();if(first)revealComment(first);}}>{sort==="old"&&<ArrowDown size={14}/>}<span>{feed.queued.length} tin mới</span></button>}{idea.data && user && <CommentEditor draftKey={`comment:${id}`} label="Thêm góc nhìn của bạn" members={members.data??[]} pending={false} onSubmit={(text,files,mentions)=>submit(text,null,files,mentions)}/>}</div>
    <aside ref={panel} hidden={!sidebarOpen} className="ih-thread-aside" id="idea-panel" role={mobile && sidebarOpen ? "dialog" : undefined} aria-modal={mobile && sidebarOpen ? true : undefined} aria-label={searchOpen?"Tìm trong phòng":"Thông tin ý tưởng"}>{searchOpen?<RoomSearch ideaId={id} members={members.data??[]} onReveal={revealComment} onClose={()=>{setSearchOpen(false);if(mobile)setSidebarOpen(false);searchButton.current?.focus();}}/>:<><div className="ih-about-top"><span className="ih-about-label">VỀ Ý TƯỞNG NÀY</span><button ref={close} className="ih-about-close" aria-label="Thu gọn thông tin ý tưởng" aria-controls="idea-panel" aria-expanded={true} onClick={() => toggleSidebar(false)}><X size={15} aria-hidden="true"/></button></div>{idea.data ? <><h2 id="idea-title">{idea.data.title}</h2><p className="ih-thread-description">{idea.data.description}</p><IdeaStatusControl idea={idea.data}/>{user&&idea.data.joined&&<button className="ih-room-mute" disabled={mute.isPending||!settings.data} onClick={()=>mute.mutate(!settings.data?.muted)}>{settings.data?.muted?<BellOff size={14}/>:<Bell size={14}/>}<span>{settings.data?.muted?"Bật thông báo phòng":"Tắt popup và push của phòng"}</span></button>}<div className="ih-about-divider"/><div className="ih-about-label">NGƯỜI KHỞI XƯỚNG</div><div className="ih-post-byline"><Avatar person={idea.data.creator}/><div><span className="ih-thread-owner">{idea.data.creator.name}</span><time dateTime={idea.data.createdAt}>Tạo {relativeTime(idea.data.createdAt)}</time></div></div><div className="ih-about-divider"/><div className="ih-about-members"><strong>{idea.data.memberCount}</strong><span>người tham gia</span></div><div className="ih-about-divider"/><div className="ih-about-label">TAGS</div><div className="ih-about-tags">{idea.data.tags.map(tag => <span key={tag} className="ih-tag">{tag}</span>)}</div><div className="ih-about-divider"/><SharedFiles comments={comments.data??[]} onReveal={revealComment} onImage={setSelectedImage}/><div className="ih-about-divider"/><RecapFiles key={`${id}:${user?.id ?? "guest"}`} ideaId={id} onReveal={revealComment}/><span className="ih-thread-side-brand">ideahub.</span></>: <p className="ih-thread-empty">{error ? "Thông tin chưa có sẵn" : "Đang tải thông tin..."}</p>}</>}</aside>
    </div>
  </section>{selectedImage&&<AttachmentViewer attachment={selectedImage} onClose={()=>setSelectedImage(null)}/>}</main>;
}
