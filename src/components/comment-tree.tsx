"use client";
import { useMemo,useState } from "react";
import { branchCommentCounts } from "@/lib/comment-unread";
import { ChevronDown, Pin, PinOff, Pencil, RefreshCw, AlertCircle, Copy, X } from "lucide-react";
import type { Author, Comment, Mention, Attachment } from "@/lib/domain";
import { AttachmentList } from "./attachment-view";
import {CommentText} from "./comment-text";
import {CommentMenu} from "./comment-menu";
import type { ThreadComment } from "@/lib/comment-outbox";
import { relativeTime } from "@/lib/format";
import { CommentEditor } from "./comment-editor";
import { Avatar } from "./avatar";

interface Props {
  allChildren?:Map<string|null,ThreadComment[]>;unread: ReadonlySet<string>; ideaId: string; creatorId: string; userId: string; children: Map<string | null, ThreadComment[]>;
  expanded: Set<string>; toggle: (id: string) => void; target: string | null; setTarget: (id: string | null) => void;
  retry:(id:string)=>void;dismiss:(id:string)=>void; submit: (text: string, parentId: string | null,files?:File[],mentions?:Mention[]) => void;members?:Author[];onEdit?:(id:string,text:string,mentions:Mention[],revision:number)=>Promise<Comment>;revise?:(id:string,text:string,mentions:Mention[])=>void;
  canPin?:boolean; pinPending?:string; onPin?:(id:string,pinned:boolean)=>void;onImage?:(a:Attachment)=>void;
}
export function CommentTree(props: Props) {
  const [editing,setEditing]=useState<string|null>(null),[edit,setEdit]=useState<{isPending:boolean;error?:Error}>({isPending:false});
  async function save(comment:ThreadComment,text:string,mentions:Mention[]){if(!props.onEdit)return;setEdit({isPending:true});try{await props.onEdit(comment.id,text,mentions,comment.revision??0);finishEdit(comment.id);setEdit({isPending:false});}catch(e){setEdit({isPending:false,error:e instanceof Error?e:new Error("Chưa lưu được thay đổi")});}}
  function finishEdit(id:string){setEditing(null);requestAnimationFrame(()=>document.getElementById(`comment-${id}`)?.querySelector<HTMLButtonElement>(".ih-comment-menu>button,.ih-delivery-retry")?.focus({preventScroll:true}));}
  function startEdit(id:string){props.setTarget(null);setEdit({isPending:false});setEditing(id);}
  const counts=useMemo(()=>branchCommentCounts(props.allChildren??props.children,props.unread),[props.allChildren,props.children,props.unread]);
  function cancel(id: string) { props.setTarget(null); requestAnimationFrame(() => document.getElementById(`reply-button-${id}`)?.focus({ preventScroll: true })); }
  function branch(parent: string | null, depth = 0): React.ReactNode {
    const comments = props.children.get(parent); if (!comments?.length) return null;
    return <ol className={parent === null ? "ih-comment-list" : `ih-replies${depth >= 3 ? " ih-replies-compact" : ""}`}>{comments.map(comment => {
      const {total:replies,unread:unreadReplies}=counts.get(comment.id)??{total:0,unread:0}, open = replies > 0 && props.expanded.has(comment.id), own = comment.author.id === props.userId;
      return <li key={comment.id} className={`ih-comment-item${open ? " ih-comment-expanded" : ""}`}>
        <article className={`ih-comment${own ? " ih-comment-own" : ""}`} id={`comment-${comment.id}`} data-delivery={comment.delivery} tabIndex={-1}>
          <Avatar person={comment.author} className="ih-comment-avatar"/>
          <div className="ih-comment-meta"><span className="ih-comment-name">{comment.author.name}</span>{comment.author.id === props.creatorId && <span className="ih-author-badge">Tác giả</span>}<span aria-hidden="true">·</span><time dateTime={comment.createdAt}>{comment.delivery==="sending"?"Đang gửi...":comment.delivery==="failed"?"Gửi thất bại":relativeTime(comment.createdAt)}</time>{comment.editedAt&&<span className="ih-edited" title={new Date(comment.editedAt).toLocaleString("vi-VN")}>đã chỉnh sửa</span>}</div>
          {comment.pinnedAt&&<span className="ih-message-pinned"><Pin size={11}/>Đã ghim</span>}
          {editing!==comment.id&&!!comment.text&&<p className={`ih-comment-text${comment.delivery==="sending"?" ih-comment-sending":""}`}><CommentText text={comment.text} mentions={comment.mentions}/></p>}
          {editing===comment.id&&<CommentEditor key={`edit:${comment.id}`} draftKey={`edit:${props.ideaId}:${comment.id}`} label={comment.delivery?"Sửa tin chưa gửi":"Chỉnh sửa bình luận"} reply editing initialText={comment.text} initialMentions={comment.mentions} members={props.members} pending={edit.isPending} error={edit.error?.message} onCancel={()=>finishEdit(comment.id)} onSubmit={(text,_files,mentions=[])=>{if(comment.delivery){props.revise?.(comment.id,text,mentions);finishEdit(comment.id);}else void save(comment,text,mentions);}}/>}
          <AttachmentList items={comment.attachments??[]} onImage={a=>props.onImage?.(a)}/>
          {comment.delivery==="failed"&&editing!==comment.id&&<div className="ih-comment-delivery-error" role="alert"><div className="ih-delivery-message"><AlertCircle size={14} aria-hidden="true"/><span>{comment.deliveryError||"Chưa gửi được bình luận. Nội dung của bạn vẫn được giữ lại"}</span></div><div className="ih-delivery-actions"><button type="button" className="ih-delivery-retry" onClick={()=>props.retry(comment.id)}><RefreshCw size={12}/>Thử lại</button><button type="button" onClick={()=>startEdit(comment.id)}><Pencil size={12}/>Sửa</button><button type="button" onClick={()=>{void navigator.clipboard.writeText(comment.text).catch(()=>{});}}><Copy size={12}/>Sao chép</button><button type="button" onClick={()=>props.dismiss(comment.id)}><X size={12}/>Bỏ</button></div></div>}<div className="ih-comment-actions" hidden={editing===comment.id}><button className="ih-reply-button" disabled={!!comment.delivery} id={`reply-button-${comment.id}`} onClick={() => {setEditing(null);props.setTarget(comment.id);}}>Trả lời</button>{props.canPin&&!comment.delivery&&<button className="ih-message-pin-button" aria-label={comment.pinnedAt?"Bỏ ghim tin nhắn":"Ghim tin nhắn"} disabled={!!props.pinPending} onClick={()=>props.onPin?.(comment.id,!comment.pinnedAt)}>{comment.pinnedAt?<PinOff size={13}/>:<Pin size={13}/>}<span>{props.pinPending===comment.id?"Đang lưu...":comment.pinnedAt?"Bỏ ghim":"Ghim"}</span></button>}{own&&!comment.delivery&&<CommentMenu onEdit={()=>startEdit(comment.id)}/>}</div>
          {props.target === comment.id && <CommentEditor draftKey={`reply:${props.ideaId}:${comment.id}`} label={`Trả lời ${own ? "bạn" : comment.author.name}`} reply members={props.members} pending={false} onCancel={() => cancel(comment.id)} onSubmit={(text,files,mentions) => props.submit(text, comment.id,files,mentions)}/>}
          {replies > 0 && <button className="ih-replies-toggle" aria-expanded={open} aria-controls={`children-${comment.id}`} onClick={() => props.toggle(comment.id)}><ChevronDown size={14} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}/><span>{open ? "Ẩn trả lời" : `Xem ${replies} trả lời`}</span>{unreadReplies>0&&<span className="ih-branch-unread"><span aria-hidden="true">•</span> {unreadReplies} tin chưa đọc</span>}</button>}
        </article>
        {replies > 0 && <div id={`children-${comment.id}`} hidden={!open}>{open && branch(comment.id, depth + 1)}</div>}
      </li>;
    })}</ol>;
  }
  return <>{branch(null)}</>;
}
