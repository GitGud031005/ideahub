import type { Comment } from "./domain";
export interface PendingComment extends Comment { delivery:"sending"|"failed"; deliveryError?:string; localFiles?:File[]; uploadedIds?:string[];originalText?:string }
export type ThreadComment = Comment & { delivery?:"sending"|"failed"; deliveryError?:string };
export function outboxKey(ideaId:string,userId:string){return `${userId}:${ideaId}`;}
export function mergeComments(saved:Comment[],pending:PendingComment[]):ThreadComment[] {
  const items=new Map<string,ThreadComment>(pending.map(comment=>[comment.id,comment]));
  for(const comment of saved)items.set(comment.id,comment);
  return [...items.values()];
}
