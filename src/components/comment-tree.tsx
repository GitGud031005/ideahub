"use client";
import { useMemo } from "react";
import { branchCommentCounts } from "@/lib/comment-unread";
import { ChevronDown, Pin, PinOff } from "lucide-react";
import type { Attachment } from "@/lib/domain";
import { AttachmentList } from "./attachment-view";
import { sharedLinks } from "@/lib/shared-content";
import type { ThreadComment } from "@/lib/comment-outbox";
import { relativeTime } from "@/lib/format";
import { CommentEditor } from "./comment-editor";
import { Avatar } from "./avatar";

interface Props {
  unread: ReadonlySet<string>; ideaId: string; creatorId: string; userId: string; children: Map<string | null, ThreadComment[]>;
  expanded: Set<string>; toggle: (id: string) => void; target: string | null; setTarget: (id: string | null) => void;
  retry:(id:string)=>void;dismiss:(id:string)=>void; submit: (text: string, parentId: string | null,files?:File[]) => void;
  canPin?:boolean; pinPending?:string; onPin?:(id:string,pinned:boolean)=>void;onImage?:(a:Attachment)=>void;
}
export function CommentTree(props: Props) {
  const counts=useMemo(()=>branchCommentCounts(props.children,props.unread),[props.children,props.unread]);
  function cancel(id: string) { props.setTarget(null); requestAnimationFrame(() => document.getElementById(`reply-button-${id}`)?.focus({ preventScroll: true })); }
  function branch(parent: string | null, depth = 0): React.ReactNode {
    const comments = props.children.get(parent); if (!comments?.length) return null;
    return <ol className={parent === null ? "ih-comment-list" : `ih-replies${depth >= 3 ? " ih-replies-compact" : ""}`}>{comments.map(comment => {
      const {total:replies,unread:unreadReplies}=counts.get(comment.id)??{total:0,unread:0}, open = replies > 0 && props.expanded.has(comment.id), own = comment.author.id === props.userId;
      return <li key={comment.id} className={`ih-comment-item${open ? " ih-comment-expanded" : ""}`}>
        <article className={`ih-comment${own ? " ih-comment-own" : ""}`} id={`comment-${comment.id}`} data-delivery={comment.delivery} tabIndex={-1}>
          <Avatar person={comment.author} className="ih-comment-avatar"/>
          <div className="ih-comment-meta"><span className="ih-comment-name">{comment.author.name}</span>{comment.author.id === props.creatorId && <span className="ih-author-badge">Tác giả</span>}<span aria-hidden="true">·</span><time dateTime={comment.createdAt}>{comment.delivery==="sending"?"Đang gửi...":comment.delivery==="failed"?"Gửi thất bại":relativeTime(comment.createdAt)}</time></div>
          {comment.pinnedAt&&<span className="ih-message-pinned"><Pin size={11}/>Đã ghim</span>}
          {!!comment.text&&<p className={`ih-comment-text${comment.delivery==="sending"?" ih-comment-sending":""}`}>{comment.text.split(/(https?:\/\/[^\s<>"']+)/gi).map((part,i)=>sharedLinks(part).length===1&&/^https?:\/\//i.test(part)?<a key={i} href={sharedLinks(part)[0]} target="_blank" rel="noopener noreferrer">{part}</a>:part)}</p>}
          <AttachmentList items={comment.attachments??[]} onImage={a=>props.onImage?.(a)}/>
          {comment.delivery==="failed"&&<div className="ih-comment-delivery-error" role="alert"><span>{comment.deliveryError}</span><button type="button" onClick={()=>props.retry(comment.id)}>Thử gửi lại</button><button type="button" onClick={()=>props.dismiss(comment.id)}>Bỏ</button></div>}<div className="ih-comment-actions"><button className="ih-reply-button" disabled={!!comment.delivery} id={`reply-button-${comment.id}`} onClick={() => props.setTarget(comment.id)}>Trả lời</button>{props.canPin&&!comment.delivery&&<button className="ih-message-pin-button" aria-label={comment.pinnedAt?"Bỏ ghim tin nhắn":"Ghim tin nhắn"} disabled={!!props.pinPending} onClick={()=>props.onPin?.(comment.id,!comment.pinnedAt)}>{comment.pinnedAt?<PinOff size={13}/>:<Pin size={13}/>}<span>{props.pinPending===comment.id?"Đang lưu...":comment.pinnedAt?"Bỏ ghim":"Ghim"}</span></button>}</div>
          {props.target === comment.id && <CommentEditor draftKey={`reply:${props.ideaId}:${comment.id}`} label={`Trả lời ${own ? "bạn" : comment.author.name}`} reply pending={false} onCancel={() => cancel(comment.id)} onSubmit={(text,files) => props.submit(text, comment.id,files)}/>}
          {replies > 0 && <button className="ih-replies-toggle" aria-expanded={open} aria-controls={`children-${comment.id}`} onClick={() => props.toggle(comment.id)}><ChevronDown size={14} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}/><span>{open ? "Ẩn trả lời" : `Xem ${replies} trả lời`}</span>{unreadReplies>0&&<span className="ih-branch-unread"><span aria-hidden="true">•</span> {unreadReplies} tin chưa đọc</span>}</button>}
        </article>
        {replies > 0 && <div id={`children-${comment.id}`} hidden={!open}>{open && branch(comment.id, depth + 1)}</div>}
      </li>;
    })}</ol>;
  }
  return <>{branch(null)}</>;
}
