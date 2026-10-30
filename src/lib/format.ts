import type {CommentSort} from "./domain";
export function initials(name: string) {
  const parts = name.trim().normalize("NFC").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] || "?").toLocaleUpperCase("vi");
}
export function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
export function relativeTime(value: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
}
/** Chat timestamps keep relative day counts even for older conversations. */
export function messageTimeAgo(value:string,now=Date.now()){
  const days=Math.floor(Math.max(0,now-Date.parse(value))/86400000);
  return days>=1?`${days} ngày trước`:relativeTime(value,now);
}
export function buildCommentForest<T extends { id: string; parentId: string | null; createdAt: string }>(items: T[], sort: CommentSort) {
  const ids = new Set(items.map(item => item.id));
  const children = new Map<string | null, T[]>();
  for (const item of items) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const branch = children.get(parent) ?? [];
    branch.push(item); children.set(parent, branch);
  }
  // Count every depth, independently of which reply branches are expanded.
  // Process leaves first to avoid recursion on deeply nested discussions.
  const replies=new Map<string,number>(),remaining=new Map<string,number>(),parents=new Map<string,string>(),queue:string[]=[];
  if(sort==="discussed"){
    for(const [parent,branch] of children)for(const item of branch){
      replies.set(item.id,0);remaining.set(item.id,children.get(item.id)?.length??0);
      if(parent)parents.set(item.id,parent);
      if(!children.get(item.id)?.length)queue.push(item.id);
    }
    for(let index=0;index<queue.length;index++){
      const id=queue[index],parent=parents.get(id);if(!parent)continue;
      replies.set(parent,(replies.get(parent)??0)+1+(replies.get(id)??0));
      const left=(remaining.get(parent)??0)-1;remaining.set(parent,left);if(left===0)queue.push(parent);
    }
  }
  for (const branch of children.values()) branch.sort((a, b) => {
    const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
    if(sort==="discussed")return (replies.get(b.id)??0)-(replies.get(a.id)??0)||-delta;
    return sort === "new" ? -delta : delta;
  });
  return children;
}
