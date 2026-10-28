"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PanelRightOpen, X, Search, ArrowDown, ArrowDownUp, Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, fetchComments } from "@/lib/api-client";
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
import { RoomScrollActivity, restoreRoomScroll, type RoomScrollAnchor } from "@/lib/room-scroll";
import {useRoomFeed} from "./use-room-feed";

export function Discussion({ id,requestedComment }: { id: string;requestedComment?:string }) {
  const session = useSession(), { user, requestLogin } = useAuth(), client = useQueryClient(), { sidebarOpen, setSidebarOpen } = useUi();
  const [sort, setSort] = useState<CommentSort>("new"), [target, setTarget] = useState<string | null>(null), [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const reveal = useRef<HTMLButtonElement>(null), close = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null), joinAttempted = useRef(false);
  const [mobile, setMobile] = useState(false),[selectedImage,setSelectedImage]=useState<Attachment|null>(null);
  const [searchOpen,setSearchOpen]=useState(false),[navigationError,setNavigationError]=useState(""),[navigationLoading,setNavigationLoading]=useState(false);
  const [navigation,setNavigation]=useState<{commentId:string;sequence:number;instant:boolean}|null>(null);
  const navigationSequence=useRef(0),positioning=useRef(false),scrollIdle=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),scrollActivity=useRef(new RoomScrollActivity()),failedTarget=useRef("");
  const anchor=useRef<RoomScrollAnchor|null>(null),searchButton=useRef<HTMLButtonElement>(null);
  const scrollBox = useRef<HTMLElement>(null), followLatest = useRef(true), previousSort = useRef(sort);
  const idea = useQuery({ queryKey: ["idea", id], queryFn: ({ signal }) => api<Idea>(`/ideas/${encodeURIComponent(id)}`, { signal }), enabled: !!session.data, refetchInterval: 15000 });
  const liveInterval = useLiveComments(id, user?.id, !!idea.data);
  const comments = useQuery({ queryKey: ["comments", id, user?.id], queryFn: ({ signal }) => fetchComments(id, signal), enabled: !!user && !!idea.data, refetchInterval: liveInterval, refetchOnWindowFocus: "always", refetchOnReconnect: "always" });
  const members=useQuery({queryKey:["room-members",id,user?.id],queryFn:({signal})=>api<Author[]>(`/ideas/${encodeURIComponent(id)}/members`,{signal}),enabled:!!user&&!!idea.data,refetchInterval:30000});
  const settings=useQuery({queryKey:["room-notification-settings",id,user?.id],queryFn:({signal})=>api<{muted:boolean}>(`/ideas/${encodeURIComponent(id)}/notification-settings`,{signal}),enabled:!!user&&!!idea.data?.joined});
  const mute=useMutation({mutationFn:(muted:boolean)=>api<{muted:boolean}>(`/ideas/${encodeURIComponent(id)}/notification-settings`,{method:"POST",body:JSON.stringify({muted})}),onSuccess:result=>{client.setQueryData(["room-notification-settings",id,user?.id],result);client.setQueryData<Idea>(["idea",id],current=>current?{...current,notificationsMuted:result.muted}:current);void client.invalidateQueries({queryKey:["ideas"]});}});
  const feed=useRoomFeed(comments.data,user?.id,followLatest);
  async function editComment(commentId:string,text:string,mentions:Mention[],revision:number){const updated=await api<Comment>(`/ideas/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/edit`,{method:"POST",body:JSON.stringify({text,mentions,revision})});client.setQueryData<Comment[]>(["comments",id,user?.id],current=>current?.map(c=>c.id===commentId?updated:c));void client.invalidateQueries({queryKey:["room-search",id]});void client.invalidateQueries({queryKey:["notifications"]});return updated;}
  const unreadComments=useReadComments(id,user?.id,!!idea.data?.joined,comments.data,expanded,!mobile||!sidebarOpen);
  const pin=useMutation({
    mutationFn:({commentId,pinned}:{commentId:string;pinned:boolean})=>api(`/ideas/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/pin`,{method:"POST",body:JSON.stringify({pinned})}),
    onSuccess:(_result,{commentId,pinned})=>{client.setQueryData<Comment[]>(["comments",id,user?.id],current=>current?.map(c=>c.id===commentId?{...c,pinnedAt:pinned?new Date().toISOString():null}:c));void client.invalidateQueries({queryKey:["comments",id,user?.id]});},
  });
  const join = useMutation({ mutationFn: () => api<Idea>(`/ideas/${encodeURIComponent(id)}/join`, { method: "POST" }), onSuccess: joined => { client.setQueryData(["idea", id], joined); client.invalidateQueries({ queryKey: ["ideas"] }); } });
  useEffect(()=>{document.documentElement.classList.add("ih-room-open");return()=>document.documentElement.classList.remove("ih-room-open");},[]);
  useEffect(() => { joinAttempted.current = false; }, [id, user?.id]);
  useEffect(() => { if (user && idea.data && !idea.data.joined && !joinAttempted.current) { joinAttempted.current = true; join.mutate(); } }, [user, idea.data, join]);
  useEffect(() => {
    const media=window.matchMedia("(max-width: 760px)");
    const change=()=>{setMobile(media.matches);if(media.matches)setSidebarOpen(false);};
    change();media.addEventListener("change",change);return()=>media.removeEventListener("change",change);
  }, [setSidebarOpen]);
  useEffect(() => {
    if (!mobile || !sidebarOpen) return;
    (searchOpen?panel.current?.querySelector<HTMLInputElement>("input"):close.current)?.focus({preventScroll:true});
    const keyboard=(event:KeyboardEvent)=>{
      if(document.querySelector("dialog[open]"))return;
      if(event.target instanceof Element&&event.target.closest("[role=listbox],[role=menu]"))return;
      if(event.key==="Escape"){event.preventDefault();setSidebarOpen(false);setSearchOpen(false);requestAnimationFrame(()=>searchOpen?searchButton.current?.focus():reveal.current?.focus());}
      if(event.key!=="Tab")return;
      const buttons=[...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')??[])].filter(el=>el.getClientRects().length>0);
      const first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener("keydown",keyboard);return()=>document.removeEventListener("keydown",keyboard);
  },[mobile,sidebarOpen,searchOpen,setSidebarOpen]);
  const outbox=useCommentOutbox(id,user);
  const sending=outbox.items.filter(c=>c.delivery==="sending").length;
  const status=sending?`Đang gửi ${sending} bình luận`:outbox.items.some(c=>c.delivery==="failed")?"Có bình luận chưa gửi được":"";
  const thread=useMemo(()=>mergeComments(feed.items,outbox.items),[feed.items,outbox.items]);
  const allTree=useMemo(()=>buildCommentForest(mergeComments(comments.data??[],outbox.items),sort),[comments.data,outbox.items,sort]);
  const tree=useMemo(()=>buildCommentForest(thread,sort),[thread,sort]);
  useLayoutEffect(() => { followLatest.current = true; }, [id]);
  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (previousSort.current !== sort) {
      previousSort.current = sort;
      if (box) { box.scrollTop = 0; followLatest.current = sort==="new"||box.scrollHeight <= box.clientHeight + 96; }
      return;
    }
    if(box&&!positioning.current){
      const moving=scrollActivity.current.active(performance.now());
      // Coordinates within the content exclude the user's own scroll distance.
      const el=anchor.current?document.getElementById(anchor.current.id):null;
      const delta=!moving&&el&&anchor.current?el.getBoundingClientRect().top-box.getBoundingClientRect().top+box.scrollTop-anchor.current.offset:undefined;
      restoreRoomScroll(box,moving,sort==="old"&&followLatest.current,!followLatest.current?delta:undefined);
    }
  }, [thread, sort]);
  function submit(text:string,parentId:string|null=null,files:File[]=[],mentions:Mention[]=[]){
    const entry=outbox.enqueue(text,parentId,files,mentions);if(!entry)return;
    if(parentId)setExpanded(current=>{const next=new Set(current),seen=new Set<string>();let parent:string|null=parentId;while(parent&&!seen.has(parent)){seen.add(parent);next.add(parent);parent=thread.find(c=>c.id===parent)?.parentId??null;}return next;});
    if(!parentId)requestAnimationFrame(()=>document.getElementById(`comment-${entry.id}`)?.scrollIntoView({block:"nearest",behavior:"instant"}));
  }
  function toggleSidebar(open: boolean) { setSearchOpen(false);setSidebarOpen(open); requestAnimationFrame(() => (open ? close : reveal).current?.focus({ preventScroll: true })); }
  async function revealComment(commentId:string,instant=false){
    const sequence=++navigationSequence.current;positioning.current=true;followLatest.current=false;anchor.current=null;
    failedTarget.current=commentId;setNavigationError("");setNavigationLoading(true);setNavigation(null);
    if(window.matchMedia("(max-width: 760px)").matches)setSidebarOpen(false);
    try{
      let snapshot=comments.data??[];
      if(!snapshot.some(c=>c.id===commentId)){
        const context=await api<Comment[]>(`/ideas/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/context`);
        if(sequence!==navigationSequence.current)return;
        await client.cancelQueries({queryKey:["comments",id,user?.id]});
        snapshot=[...new Map([...(client.getQueryData<Comment[]>(["comments",id,user?.id])??[]),...context].map(c=>[c.id,c])).values()];
        client.setQueryData(["comments",id,user?.id],snapshot);
      }
      if(sequence!==navigationSequence.current)return;
      feed.release(snapshot);
      setExpanded(current=>{const next=new Set(current),seen=new Set<string>(),byId=new Map(snapshot.map(c=>[c.id,c]));let parent=byId.get(commentId)?.parentId;
        while(parent&&!seen.has(parent)){seen.add(parent);next.add(parent);parent=byId.get(parent)?.parentId;}return next;});
      setNavigation({commentId,sequence,instant});
    }catch(error){if(sequence!==navigationSequence.current)return;positioning.current=false;setNavigationLoading(false);setNavigationError(error instanceof ApiError&&error.status===404?"Tin nhắn này đã bị xóa hoặc không thuộc phòng":"Chưa mở được tin nhắn. Vui lòng thử lại");}
  }
  const revealCommentRef=useRef(revealComment);revealCommentRef.current=revealComment;
  useLayoutEffect(()=>{
    if(!navigation)return;
    const box=scrollBox.current,el=document.getElementById(`comment-${navigation.commentId}`);
    if(!box||!el||mobile&&sidebarOpen)return;
    let timer:ReturnType<typeof setTimeout>|undefined,frame=0,observer:ResizeObserver|undefined;
    const finish=()=>{if(navigation.sequence!==navigationSequence.current)return;positioning.current=false;anchor.current={id:el.id,offset:el.getBoundingClientRect().top-box.getBoundingClientRect().top+box.scrollTop};setNavigation(null);setNavigationLoading(false);};
    // Two frames allow viewport/composer CSS to settle after a mobile dialog closes.
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{
      if(navigation.sequence!==navigationSequence.current)return;
      const place=(animate:boolean)=>{
        if(navigation.sequence!==navigationSequence.current)return;
        const bounds=box.getBoundingClientRect(),target=el.getBoundingClientRect();
        const top=Math.max(0,Math.min(box.scrollHeight-box.clientHeight,box.scrollTop+target.top-bounds.top-16));
        const smooth=animate&&!navigation.instant&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&Math.abs(top-box.scrollTop)<box.clientHeight;
        box.scrollTo({top,behavior:smooth?"smooth":"instant"});
      };
      place(true);el.focus({preventScroll:true});
      el.classList.remove("ih-comment-located");void el.offsetWidth;el.classList.add("ih-comment-located");
      let geometry=`${box.clientHeight}:${el.offsetHeight}:${box.scrollHeight}`;
      observer=new ResizeObserver(()=>{const next=`${box.clientHeight}:${el.offsetHeight}:${box.scrollHeight}`;if(next===geometry)return;geometry=next;place(false);clearTimeout(timer);timer=setTimeout(finish,700);});
      observer.observe(box);observer.observe(el);const list=box.querySelector(".ih-comment-list");if(list)observer.observe(list);
      timer=setTimeout(finish,700);
    });});
    return()=>{cancelAnimationFrame(frame);clearTimeout(timer);observer?.disconnect();};
  },[navigation,thread,expanded,mobile,sidebarOpen]);
  useEffect(()=>{const reveal=(event:Event)=>{const detail=(event as CustomEvent<{ideaId:string;commentId:string}>).detail;if(detail?.ideaId===id)void revealCommentRef.current(detail.commentId);};window.addEventListener("ideahub:reveal-comment",reveal);return()=>window.removeEventListener("ideahub:reveal-comment",reveal);},[id]);
  useEffect(()=>{const composer=scrollBox.current?.parentElement?.querySelector<HTMLElement>(".ih-thread-composer");if(!composer)return;const update=()=>composer.parentElement?.style.setProperty("--composer-height",`${composer.getBoundingClientRect().height}px`);const observer=new ResizeObserver(update);observer.observe(composer);update();return()=>observer.disconnect();},[user?.id,!!idea.data]);
  const deepLinkDone=useRef("");
  useEffect(()=>{if(!requestedComment){deepLinkDone.current="";return;}const key=`${id}:${user?.id}:${requestedComment}`;if(!user||!comments.data||deepLinkDone.current===key)return;deepLinkDone.current=key;void revealCommentRef.current(requestedComment,true);},[id,user?.id,requestedComment,comments.data]);
  useEffect(()=>{const handler=(event:MessageEvent)=>{if(event.data?.type!=="CHECK_COMMENT")return;const el=document.getElementById(`comment-${event.data.commentId}`),box=scrollBox.current,a=el?.getBoundingClientRect(),b=box?.getBoundingClientRect();event.ports[0]?.postMessage({visible:!!user&&user.id===event.data.userId&&!document.hidden&&document.hasFocus()&&!!el?.getClientRects().length&&!!a&&!!b&&a.bottom>b.top&&a.top<b.bottom&&!(mobile&&sidebarOpen),userId:user?.id??null});};navigator.serviceWorker?.addEventListener("message",handler);return()=>navigator.serviceWorker?.removeEventListener("message",handler);},[user,mobile,sidebarOpen]);
  function cancelNavigation(){if(!positioning.current)return;navigationSequence.current++;positioning.current=false;setNavigation(null);setNavigationLoading(false);}
  function captureScrollAnchor(){
    const box=scrollBox.current;
    if(!box||positioning.current||scrollActivity.current.active(performance.now()))return;
    const top=box.getBoundingClientRect().top;
    const el=[...box.querySelectorAll<HTMLElement>("article.ih-comment")].find(el=>el.getBoundingClientRect().bottom>top+5);
    anchor.current=el?{id:el.id,offset:el.getBoundingClientRect().top-top+box.scrollTop}:null;
  }
  function recordScroll(){
    const box=scrollBox.current;if(!box||positioning.current)return;
    scrollActivity.current.scroll(performance.now());
    followLatest.current=sort==="old"?box.scrollHeight-box.scrollTop-box.clientHeight<96:box.scrollTop<96;
    // Do not measure every article on every animation frame. Capture once at rest.
    clearTimeout(scrollIdle.current);scrollIdle.current=setTimeout(captureScrollAnchor,220);
  }
  useEffect(()=>{
    const box=scrollBox.current;if(!box)return;
    const start=()=>{scrollActivity.current.touchStart(performance.now());clearTimeout(scrollIdle.current);};
    const end=()=>{scrollActivity.current.touchEnd(performance.now());clearTimeout(scrollIdle.current);scrollIdle.current=setTimeout(captureScrollAnchor,220);};
    box.addEventListener("touchstart",start,{passive:true});box.addEventListener("touchend",end,{passive:true});box.addEventListener("touchcancel",end,{passive:true});
    return()=>{box.removeEventListener("touchstart",start);box.removeEventListener("touchend",end);box.removeEventListener("touchcancel",end);clearTimeout(scrollIdle.current);navigationSequence.current++;};
  },[]);
  const error = session.error || idea.error;
  return <main className="ih-discussion" aria-labelledby="discussion-title"><section className={`ih-discussion-page${!sidebarOpen ? " ih-aside-collapsed" : ""}`}>
    <header className="ih-discussion-header" inert={mobile && sidebarOpen}><div className="ih-discussion-heading"><Link className="ih-thread-back" href="/" scroll={false} aria-label="Quay lại bảng ý tưởng"><ChevronLeft size={16} aria-hidden="true"/></Link><h1 id="discussion-title">Thảo luận <span className="ih-comment-count">{comments.data?mergeComments(comments.data,outbox.items).length:(idea.data?.commentCount??0)+outbox.items.length}</span></h1></div><div className="ih-discussion-actions"><NotificationBell/>{user&&<button ref={searchButton} className="ih-about-toggle" aria-label="Tìm trong phòng" aria-expanded={searchOpen&&sidebarOpen} onClick={()=>{if(searchOpen&&sidebarOpen){setSearchOpen(false);if(mobile)setSidebarOpen(false);return;}window.dispatchEvent(new CustomEvent("ideahub:surface-open",{detail:"room-search"}));setSearchOpen(true);setSidebarOpen(true);}}><Search size={17}/></button>}<div className="ih-discussion-sort"><ArrowDownUp className="ih-sort-compact-icon" size={16} aria-hidden="true"/><span className="ih-sort-caption">Sắp xếp</span><Select label="Sắp xếp bình luận" value={sort} onChange={setSort} disabled={!idea.data} options={[{ value: "old", label: "Cũ nhất" }, { value: "new", label: "Mới nhất" }]}/></div>{!sidebarOpen && <button ref={reveal} className="ih-about-toggle" aria-label="Mở thanh thông tin ý tưởng" aria-controls="idea-panel" aria-expanded={false} onClick={() => toggleSidebar(true)}><PanelRightOpen size={17} aria-hidden="true"/></button>}</div></header>
    <button type="button" className="ih-aside-scrim" hidden={!sidebarOpen} aria-label="Đóng thanh thông tin ý tưởng" onClick={() => toggleSidebar(false)}/>
    <div className="ih-thread-layout"><div className="ih-thread-main" inert={mobile && sidebarOpen}>{navigationLoading&&<p className="ih-message-navigation-status" role="status">Đang mở tin nhắn…</p>}<section ref={scrollBox} className="ih-thread-comments" aria-label="Nội dung thảo luận" aria-busy={navigationLoading} onPointerDown={cancelNavigation} onWheel={cancelNavigation} onKeyDown={event=>{if(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"].includes(event.key))cancelNavigation();}} onScroll={recordScroll}>
      {error ? <ErrorState error={error} retry={() => { session.refetch(); idea.refetch(); }}/> : !idea.data ? <LoadingState label="Đang mở thảo luận..."/> : <>
        {navigationError&&<p className="ih-inline-error" role="alert">{navigationError}<button className="ih-reply-button" onClick={()=>void revealComment(failedTarget.current)}>Thử lại</button></p>}{mute.error&&<p className="ih-inline-error" role="alert">{mute.error.message}</p>}{pin.error&&<p className="ih-inline-error" role="alert">{pin.error.message}</p>}
        {join.error && <div className="ih-inline-error" role="alert">{join.error.message}<button className="ih-reply-button" onClick={() => join.mutate()} disabled={join.isPending}>Thử tham gia lại</button></div>}
        {!user ? <div className="ih-thread-login"><h2>Cùng góp một góc nhìn</h2><p>Đăng nhập để tham gia cuộc thảo luận này</p><button className="ih-primary" type="button" onClick={() => requestLogin(undefined,window.location.pathname+window.location.search)}>Đăng nhập để tham gia</button></div> : comments.error && !thread.length ? <ErrorState error={comments.error} retry={() => { comments.refetch(); }}/> : comments.isPending && !thread.length ? <LoadingState label="Đang tải bình luận..."/> : !thread.length ? <p className="ih-thread-empty">Cuộc thảo luận đang chờ góc nhìn đầu tiên của bạn</p> : <CommentTree allChildren={allTree} members={members.data??[]} onEdit={editComment} revise={outbox.revise} unread={unreadComments} ideaId={id} creatorId={idea.data.creator.id} userId={user.id} children={tree} expanded={expanded} toggle={commentId => {if(!expanded.has(commentId))feed.releaseBranch(commentId);setExpanded(current => { const next = new Set(current); if (next.has(commentId)) next.delete(commentId); else next.add(commentId); return next; });}} target={target} setTarget={setTarget} retry={outbox.retry} dismiss={outbox.dismiss} submit={submit} canPin={!!idea.data.joined} pinPending={pin.isPending?pin.variables?.commentId:undefined} onPin={(commentId,pinned)=>pin.mutate({commentId,pinned})} onImage={setSelectedImage}/>}
      </>}
      <p className="ih-sr" role="status" aria-live="polite">{status}</p>
    </section>{feed.queued.length>0&&<button className="ih-new-messages" onClick={()=>{const first=feed.release();if(first)revealComment(first);}}>{sort==="old"&&<ArrowDown size={14}/>}<span>{feed.queued.length} tin mới</span></button>}{idea.data && user && <CommentEditor draftKey={`comment:${id}`} label="Thêm góc nhìn của bạn" members={members.data??[]} pending={false} onSubmit={(text,files,mentions)=>submit(text,null,files,mentions)}/>}</div>
    <aside ref={panel} hidden={!sidebarOpen} className="ih-thread-aside" id="idea-panel" role={mobile && sidebarOpen ? "dialog" : undefined} aria-modal={mobile && sidebarOpen ? true : undefined} aria-label={searchOpen?"Tìm trong phòng":"Thông tin ý tưởng"}>{searchOpen?<RoomSearch ideaId={id} members={members.data??[]} onReveal={revealComment} onClose={()=>{setSearchOpen(false);if(mobile)setSidebarOpen(false);searchButton.current?.focus();}}/>:<><div className="ih-about-top"><span className="ih-about-label">VỀ Ý TƯỞNG NÀY</span><button ref={close} className="ih-about-close" aria-label="Thu gọn thông tin ý tưởng" aria-controls="idea-panel" aria-expanded={true} onClick={() => toggleSidebar(false)}><X size={15} aria-hidden="true"/></button></div>{idea.data ? <><h2 id="idea-title">{idea.data.title}</h2><p className="ih-thread-description">{idea.data.description}</p><IdeaStatusControl idea={idea.data}/>{user&&idea.data.joined&&<button className="ih-room-mute" disabled={mute.isPending||!settings.data} onClick={()=>mute.mutate(!settings.data?.muted)}>{settings.data?.muted?<BellOff size={14}/>:<Bell size={14}/>}<span>{settings.data?.muted?"Bật thông báo phòng":"Tắt popup và push của phòng"}</span></button>}<div className="ih-about-divider"/><div className="ih-about-label">NGƯỜI KHỞI XƯỚNG</div><div className="ih-post-byline"><Avatar person={idea.data.creator}/><div><span className="ih-thread-owner">{idea.data.creator.name}</span><time dateTime={idea.data.createdAt}>Tạo {relativeTime(idea.data.createdAt)}</time></div></div><div className="ih-about-divider"/><div className="ih-about-members"><strong>{idea.data.memberCount}</strong><span>người tham gia</span></div><div className="ih-about-divider"/><div className="ih-about-label">TAGS</div><div className="ih-about-tags">{idea.data.tags.map(tag => <span key={tag} className="ih-tag">{tag}</span>)}</div><div className="ih-about-divider"/><SharedFiles comments={comments.data??[]} onReveal={revealComment} onImage={setSelectedImage}/><div className="ih-about-divider"/><RecapFiles key={`${id}:${user?.id ?? "guest"}`} ideaId={id} onReveal={revealComment}/><span className="ih-thread-side-brand">ideahub.</span></>: <p className="ih-thread-empty">{error ? "Thông tin chưa có sẵn" : "Đang tải thông tin..."}</p>}</>}</aside>
    </div>
  </section>{selectedImage&&<AttachmentViewer attachment={selectedImage} onClose={()=>setSelectedImage(null)}/>}</main>;
}
