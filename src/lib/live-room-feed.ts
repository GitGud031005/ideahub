import type {Comment} from "./domain";

/** An expanded descendant is still hidden if any ancestor was collapsed. */
export function openReplyPath(comment:Comment,byId:ReadonlyMap<string,Comment>,expanded:ReadonlySet<string>){
  if(!comment.parentId)return false;
  const seen=new Set<string>();let parentId:string|null=comment.parentId;
  while(parentId){
    if(seen.has(parentId)||!expanded.has(parentId))return false;
    seen.add(parentId);const parent=byId.get(parentId);if(!parent)return false;
    parentId=parent.parentId;
  }
  return true;
}

/** New descendants of an open path stay open; existing collapsed branches stay closed. */
export function extendOpenReplies(previous:ReadonlySet<string>,comments:Comment[],expanded:ReadonlySet<string>){
  const byId=new Map(comments.map(c=>[c.id,c])),next=new Set(expanded),visiting=new Set<string>();
  function open(id:string):boolean{
    if(visiting.has(id))return false;
    const c=byId.get(id);if(!c)return false;
    visiting.add(id);
    const parentOpen=!c.parentId||open(c.parentId);
    visiting.delete(id);
    if(parentOpen&&!previous.has(id)&&c.parentId)next.add(id);
    return parentOpen&&next.has(id);
  }
  for(const c of comments)open(c.id);
  return next.size===expanded.size?expanded:next;
}

/** A new-message marker must never turn the visible room into an old data snapshot. */
export function reconcileRoomFeed(data:Comment[],known:ReadonlySet<string>,held:ReadonlySet<string>,userId:string|undefined,following:boolean,inOpenBranch:(c:Comment)=>boolean){
  return {items:data,queued:data.filter(c=>c.author.id!==userId&&!inOpenBranch(c)&&(held.has(c.id)||!known.has(c.id)&&!following))};
}
