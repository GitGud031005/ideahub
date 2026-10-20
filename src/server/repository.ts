import { randomUUID } from "node:crypto";
import type { Author, Comment, CommentsPage, CreateCommentInput, CreateIdeaInput, Idea, IdeaQuery, IdeasPage, JoinedIdeaStatus, UnreadCounts, RoomActivity } from "@/lib/domain";
import { normalize } from "@/lib/format";
import { AppError, notFound } from "./errors";
import type { DataState, IdeaRecord, StateStore } from "./state";
import { readIdeaCursor, writeIdeaCursor } from "./idea-pagination";
import { publicAttachment, type StoredAttachment } from "./attachment-record";

/** Shared storage contract implemented by state and PostgreSQL repositories. */
export interface IdeaRepository {
  listIdeas(userId: string, query: IdeaQuery): Promise<IdeasPage>;
  getIdea(id: string, userId: string): Promise<Idea>;
  createIdea(user: Author, input: CreateIdeaInput): Promise<Idea>;
  joinIdea(id: string, userId: string): Promise<Idea>;
  setIdeaStatus(id: string, userId: string, status: JoinedIdeaStatus): Promise<Idea>;
  listComments(ideaId: string, cursor?: string, limit?: number): Promise<CommentsPage>;
  createComment(ideaId: string, user: Author, input: CreateCommentInput): Promise<Comment>;
  getActivity(ideaId:string):Promise<RoomActivity>;
  unreadCounts(userId:string):Promise<UnreadCounts>;
  unreadCommentIds(ideaId:string,userId:string):Promise<string[]>;
  markRead(ideaId:string,userId:string,commentIds:string|string[]):Promise<void>;
  saveAttachment(attachment:StoredAttachment):Promise<void>;
  getAttachment(ideaId:string,id:string,userId:string):Promise<StoredAttachment>;
  pinComment(ideaId:string,commentId:string,userId:string,pinned:boolean):Promise<void>;
}
function present(idea: IdeaRecord, state: DataState, userId: string): Idea {
  const { members, memberJoinedAt: _joinedAt, memberReadCursor:_read, discussionVersion:_version, memberReadComments:_receipts, memberArchived:_archived, status:_legacy, ...record } = idea;
  return { ...record, status: !members.includes(userId) ? "new" : idea.memberArchived?.[userId] ? "archived" : "potential", memberCount: members.length, commentCount: state.comments.filter(c => c.ideaId === idea.id).length, joined: members.includes(userId), mine: idea.creator.id === userId };
}
export class StateIdeaRepository implements IdeaRepository {
  constructor(private store: StateStore) {}
  getActivity(id:string){return this.store.read(state=>{const idea=state.ideas.find(i=>i.id===id);if(!idea)throw notFound();return {commentCount:state.comments.filter(c=>c.ideaId===id).length,memberCount:idea.members.length,version:String(idea.discussionVersion??0)};});}
  saveAttachment(attachment:StoredAttachment){return this.store.transact(state=>{
    const idea=state.ideas.find(i=>i.id===attachment.ideaId);if(!idea)throw notFound();
    if(!idea.members.includes(attachment.ownerId))throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để gửi tệp");
    (state.attachments??=[]).push(attachment);
  });}
  getAttachment(ideaId:string,id:string,userId:string){return this.store.read(state=>{
    const a=state.attachments?.find(a=>a.id===id&&a.ideaId===ideaId);
    if(!a||(!a.commentId&&a.ownerId!==userId))throw notFound();return a;
  });}
  pinComment(ideaId:string,commentId:string,userId:string,pinned:boolean){return this.store.transact(state=>{
    const idea=state.ideas.find(i=>i.id===ideaId);if(!idea)throw notFound();
    if(!idea.members.includes(userId))throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để ghim tin nhắn");
    const c=state.comments.find(c=>c.ideaId===ideaId&&c.id===commentId);if(!c)throw notFound();
    if(pinned&&!c.pinnedAt&&state.comments.filter(c=>c.ideaId===ideaId&&c.pinnedAt).length>=50)throw new AppError(422,"PIN_LIMIT","Mỗi cuộc thảo luận ghim tối đa 50 tin nhắn");
    if(!!c.pinnedAt!==pinned){c.pinnedAt=pinned?new Date().toISOString():null;idea.discussionVersion=(idea.discussionVersion??0)+1;}
  });}
  unreadCounts(userId:string){return this.store.read(state=>Object.fromEntries(state.ideas.filter(i=>i.members.includes(userId)).map(i=>[i.id,state.comments.filter((c,n)=>c.ideaId===i.id&&c.author.id!==userId&&BigInt(c.readCursor??String(n+1))>BigInt(i.memberReadCursor?.[userId]??"0")&&!i.memberReadComments?.[userId]?.includes(c.id)).length])));}
  unreadCommentIds(ideaId:string,userId:string){return this.store.read(state=>{
    const idea=state.ideas.find(i=>i.id===ideaId);if(!idea)throw notFound();
    if(!idea.members.includes(userId))throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để xem tin chưa đọc");
    const read=new Set(idea.memberReadComments?.[userId]??[]);
    return state.comments.filter((c,n)=>c.ideaId===ideaId&&c.author.id!==userId&&BigInt(c.readCursor??String(n+1))>BigInt(idea.memberReadCursor?.[userId]??"0")&&!read.has(c.id)).map(c=>c.id);
  });}
  markRead(ideaId:string,userId:string,commentIds:string|string[]){return this.store.transact(state=>{
    const idea=state.ideas.find(i=>i.id===ideaId);if(!idea)throw notFound();if(!idea.members.includes(userId))throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng trước khi đánh dấu đã đọc");
    const ids=[...new Set(typeof commentIds==="string"?[commentIds]:commentIds)];
    if(ids.some(id=>!state.comments.some(c=>c.ideaId===ideaId&&c.id===id)))throw new AppError(400,"INVALID_COMMENT","Bình luận không thuộc ý tưởng này");
    const read=new Set(idea.memberReadComments?.[userId]??[]);
    for(const id of ids)read.add(id);
    (idea.memberReadComments??={})[userId]=[...read];
  });}
  async listIdeas(userId: string, query: IdeaQuery) {
    const cursor = readIdeaCursor(userId, query);
    return this.store.read(state => {
      const snapshot = cursor?.snapshot ?? new Date().toISOString();
      const before = (time?: string) => !time || Date.parse(time) <= Date.parse(snapshot);
      const q = normalize(query.q);
      const ranked = state.ideas.filter(i => before(i.createdAt)).map(i => {
        const item = present(i, state, userId);
        const joined = i.members.includes(userId) && before(i.memberJoinedAt?.[userId]);
        return { item: { ...item, joined, status: !joined ? "new" as const : i.memberArchived?.[userId] ? "archived" as const : "potential" as const },
          rank: query.sort === "popular" ? i.members.filter(id => before(i.memberJoinedAt?.[id])).length : 0 };
      });
      const counts = { all: ranked.length, new: ranked.filter(p => p.item.status === "new").length,
        potential: ranked.filter(p => p.item.status === "potential").length, archived: ranked.filter(p => p.item.status === "archived").length,
        mine: ranked.filter(p => p.item.mine).length };
      const filtered = ranked.filter(({ item: i }) => (query.view === "all" || (query.view === "mine" ? i.mine : i.status === query.view)) && normalize([i.title, i.description, ...i.tags].join(" ")).includes(q));
      const compare = (a: {rank: number; createdAt: string; id: string}, b: {rank: number; createdAt: string; id: string}) =>
        b.rank - a.rank || Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      filtered.sort((a, b) => compare({ ...a.item, rank: a.rank }, { ...b.item, rank: b.rank }));
      const remaining = cursor ? filtered.filter(({ item, rank }) => compare({ ...item, rank }, { ...cursor, rank: cursor.members }) > 0) : filtered.slice(query.offset);
      const page = remaining.slice(0, query.limit), last = page.at(-1);
      return { items: page.map(p => p.item), total: filtered.length, counts,
        nextCursor: remaining.length > query.limit && last ? writeIdeaCursor(userId, query, { snapshot, createdAt: last.item.createdAt, id: last.item.id, members: last.rank }) : null };
    });
  }
  getIdea(id: string, userId: string) {
    return this.store.read(state => { const idea = state.ideas.find(i => i.id === id); if (!idea) throw notFound(); return present(idea, state, userId); });
  }
  createIdea(user: Author, input: CreateIdeaInput) {
    return this.store.transact(state => {
      const idea: IdeaRecord = { ...input, id: randomUUID(), creator: user, createdAt: new Date().toISOString(), tags: [...new Set([input.category, ...input.tags])].slice(0, 12), members: [user.id] };
      state.ideas.push(idea); return present(idea, state, user.id);
    });
  }
  setIdeaStatus(id: string, userId: string, status: JoinedIdeaStatus) {
    return this.store.transact(state => {
      const idea = state.ideas.find(i => i.id === id); if (!idea) throw notFound();
      if (!idea.members.includes(userId)) throw new AppError(403, "NOT_JOINED", "Tham gia ý tưởng để thay đổi phân loại");
      (idea.memberArchived ??= {})[userId] = status === "archived"; return present(idea, state, userId);
    });
  }
  joinIdea(id: string, userId: string) {
    return this.store.transact(state => {
      const idea = state.ideas.find(i => i.id === id); if (!idea) throw notFound();
      if (!idea.members.includes(userId)) { idea.members.push(userId); (idea.memberJoinedAt ??= {})[userId] = new Date().toISOString(); (idea.memberReadCursor??={})[userId]="0"; }
      return present(idea, state, userId);
    });
  }
  listComments(ideaId: string, cursor?: string, limit = 100) {
    return this.store.read(state => {
      if (!state.ideas.some(i => i.id === ideaId)) throw notFound();
      const all = state.comments.filter(c => c.ideaId === ideaId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      const index = cursor ? all.findIndex(c => c.id === cursor) : -1;
      if (cursor && index < 0) throw new AppError(400, "INVALID_CURSOR", "Vị trí bình luận không hợp lệ");
      const items = all.slice(index + 1, index + 1 + limit).map(c=>({...c,readCursor:c.readCursor??String(state.comments.indexOf(c)+1)}));
      return { items, total: all.length, nextCursor: index + 1 + items.length < all.length ? items.at(-1)?.id ?? null : null };
    });
  }
  createComment(ideaId: string, user: Author, input: CreateCommentInput) {
    return this.store.transact(state => {
      const idea = state.ideas.find(i => i.id === ideaId); if (!idea) throw notFound();
      const parentId = input.parentId ?? null;
      if(input.clientId){
        const existing=state.comments.find(c=>c.id===input.clientId);
        if(existing){if(existing.ideaId!==ideaId||existing.author.id!==user.id||existing.parentId!==parentId||existing.text!==input.text||JSON.stringify(existing.attachments?.map(a=>a.id)??[])!==JSON.stringify(input.attachmentIds??[]))throw new AppError(409,"COMMENT_CONFLICT","Mã gửi bình luận đã được dùng");return existing;}
      }
      let parent = parentId, depth = 0;
      const seen = new Set<string>();
      while (parent) {
        const entry = state.comments.find(c => c.id === parent && c.ideaId === ideaId);
        if (!entry) throw new AppError(400, "INVALID_PARENT", "Bình luận gốc không thuộc cuộc thảo luận này");
        if (seen.has(parent) || ++depth > 12) throw new AppError(422, "MAX_DEPTH", "Nhánh trả lời đã quá sâu, hãy trả lời một bình luận gần hơn");
        seen.add(parent); parent = entry.parentId;
      }
      const receipts=(input.attachmentIds??[]).map(id=>{const a=state.attachments?.find(a=>a.id===id&&a.ideaId===ideaId&&a.ownerId===user.id&&!a.commentId);if(!a)throw new AppError(422,"INVALID_ATTACHMENT","Tệp không thuộc bạn hoặc đã được gửi");return a;});
      const comment: Comment = { id: input.clientId ?? randomUUID(), ideaId, parentId, author: user, text: input.text, createdAt: new Date().toISOString(),readCursor:String(state.comments.length+1),...(receipts.length?{attachments:receipts.map(publicAttachment)}:{}) };
      for(const receipt of receipts)receipt.commentId=comment.id;
      if (!idea.members.includes(user.id)) { idea.members.push(user.id); (idea.memberJoinedAt ??= {})[user.id] = new Date().toISOString(); (idea.memberReadCursor??={})[user.id]="0"; }
      state.comments.push(comment); return comment;
    });
  }
}
