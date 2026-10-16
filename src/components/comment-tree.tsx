"use client";
import { ChevronDown } from "lucide-react";
import type { Comment } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { CommentEditor } from "./comment-editor";

interface Props {
  ideaId: string; creatorId: string; userId: string; children: Map<string | null, Comment[]>;
  expanded: Set<string>; toggle: (id: string) => void; target: string | null; setTarget: (id: string | null) => void;
  pending: boolean; error?: string; errorParent: string | null; submit: (text: string, parentId: string | null) => void;
}
export function CommentTree(props: Props) {
  function count(id: string, seen = new Set<string>()): number {
    if (seen.has(id)) return 0; seen.add(id);
    return (props.children.get(id) ?? []).reduce((sum, child) => sum + 1 + count(child.id, seen), 0);
  }
  function cancel(id: string) { props.setTarget(null); requestAnimationFrame(() => document.getElementById(`reply-button-${id}`)?.focus({ preventScroll: true })); }
  function branch(parent: string | null, depth = 0): React.ReactNode {
    const comments = props.children.get(parent); if (!comments?.length) return null;
    return <ol className={parent === null ? "ih-comment-list" : `ih-replies${depth >= 3 ? " ih-replies-compact" : ""}`}>{comments.map(comment => {
      const replies = count(comment.id), open = replies > 0 && props.expanded.has(comment.id), own = comment.author.id === props.userId;
      return <li key={comment.id} className={`ih-comment-item${open ? " ih-comment-expanded" : ""}`}>
        <article className={`ih-comment${own ? " ih-comment-own" : ""}`} id={`comment-${comment.id}`}>
          <span className="ih-comment-avatar" aria-hidden="true">{comment.author.initial}</span>
          <div className="ih-comment-meta"><span className="ih-comment-name">{comment.author.name}</span>{comment.author.id === props.creatorId && <span className="ih-author-badge">Tác giả</span>}<span aria-hidden="true">·</span><time dateTime={comment.createdAt}>{relativeTime(comment.createdAt)}</time></div>
          <p className="ih-comment-text">{comment.text}</p><button className="ih-reply-button" id={`reply-button-${comment.id}`} onClick={() => props.setTarget(comment.id)}>Trả lời</button>
          {props.target === comment.id && <CommentEditor draftKey={`reply:${props.ideaId}:${comment.id}`} label={`Trả lời ${own ? "bạn" : comment.author.name}`} reply pending={props.pending} error={props.errorParent === comment.id ? props.error : undefined} onCancel={() => cancel(comment.id)} onSubmit={text => props.submit(text, comment.id)}/>}
          {replies > 0 && <button className="ih-replies-toggle" aria-expanded={open} aria-controls={`children-${comment.id}`} onClick={() => props.toggle(comment.id)}><ChevronDown size={14} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }}/>{open ? "Ẩn trả lời" : `Xem ${replies} trả lời`}</button>}
        </article>
        {replies > 0 && <div id={`children-${comment.id}`} hidden={!open}>{open && branch(comment.id, depth + 1)}</div>}
      </li>;
    })}</ol>;
  }
  return <>{branch(null)}</>;
}
