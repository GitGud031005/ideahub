import {checkMentions,notificationRecipients} from "./collaboration";
import {sameMentions} from "@/lib/mentions";
import { randomUUID, createECDH } from "node:crypto";
import type { Author, EditCommentInput, NotificationsPage, PushRegistration, Comment, CommentsPage, CreateCommentInput, CreateIdeaInput, Idea, IdeaQuery, IdeasPage, JoinedIdeaStatus, UnreadCounts, RoomActivity } from "@/lib/domain";
import { normalize } from "@/lib/format";
import { AppError, notFound } from "./errors";
import type { DataState, IdeaRecord, StateStore } from "./state";
import { readIdeaCursor, writeIdeaCursor } from "./idea-pagination";
import { publicAttachment, type StoredAttachment } from "./attachment-record";

/** Shared storage contract implemented by state and PostgreSQL repositories. */
export interface IdeaRepository {
  listMembers(ideaId:string,userId:string):Promise<Author[]>;
  searchComments(ideaId:string,userId:string,q:string,authorId:string,offset:number):Promise<CommentsPage>;
  editComment(ideaId:string,commentId:string,user:Author,input:EditCommentInput):Promise<Comment>;
  notificationVersion(userId:string):Promise<string>;
  getCommentContext(ideaId:string,commentId:string):Promise<Comment[]>;
  listNotifications(userId:string,unreadOnly:boolean,offset:number):Promise<NotificationsPage>;
  readNotifications(userId:string,ids:string[]|"all"):Promise<void>;
  roomMuted(ideaId:string,userId:string):Promise<boolean>;
  muteRoom(ideaId:string,userId:string,muted:boolean):Promise<void>;
  pushKeys():Promise<{publicKey:string;privateKey:string}>;
  savePush(userId:string,subscription:PushRegistration):Promise<void>;
  removePush(userId:string,endpoint:string):Promise<void>;
  claimPush():Promise<import("./collaboration").StoredNotification[]>;
  subscriptions(userId:string):Promise<PushRegistration[]>;
  finishPush(id:string,retry:boolean):Promise<void>;
  listIdeas(userId: string, query: IdeaQuery): Promise<IdeasPage>;
  getIdea(id: string, userId: string): Promise<Idea>;
  createIdea(user: Author, input: CreateIdeaInput): Promise<Idea>;
  joinIdea(id: string, userId: string,user?:Author): Promise<Idea>;
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
  const comments=state.comments.filter(c=>c.ideaId===idea.id);
  const lastCommentAt=comments.reduce<string|null>((last,c)=>!last||Date.parse(c.createdAt)>Date.parse(last)?c.createdAt:last,null);
  return { ...record, lastCommentAt, status: !members.includes(userId) ? "new" : idea.memberArchived?.[userId] ? "archived" : "potential", memberCount: members.length, commentCount: comments.length, joined: members.includes(userId), mine: idea.creator.id === userId, notificationsMuted: members.includes(userId) && (state.mutedRooms?.[userId]?.includes(idea.id) ?? false) };
}
export class StateIdeaRepository implements IdeaRepository {
  constructor(private store: StateStore) {}
  private members(state:DataState,id:string){const room=state.ideas.find(i=>i.id===id);if(!room)throw notFound();const people=[...(state.users??[]),...state.ideas.map(i=>i.creator),...state.comments.map(c=>c.author)];return room.members.map(id=>people.find(p=>p.id===id)??{id,name:`Thành viên ${id.slice(0,4)}`,initial:"TV"});}
  listMembers(id:string,_userId:string){return this.store.read(state=>this.members(state,id));}
  searchComments(id:string,_userId:string,q:string,authorId:string,offset:number){return this.store.read(state=>{this.members(state,id);const all=state.comments.filter(c=>c.ideaId===id&&(!authorId||c.author.id===authorId)&&normalize(c.text).includes(normalize(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));return {items:all.slice(offset,offset+30),total:all.length,nextCursor:offset+30<all.length?String(offset+30):null};});}
  private notify(state:DataState,c:Comment,parent?:Comment,old:import("@/lib/domain").Mention[]|undefined=undefined){const room=state.ideas.find(i=>i.id===c.ideaId)!;for(const [userId,kind] of notificationRecipients(c,parent,old,room.members)){if(!room.members.includes(userId)||(state.notifications??[]).some(n=>n.userId===userId&&n.commentId===c.id))continue;(state.notifications??=[]).push({id:randomUUID(),userId,kind,ideaId:c.ideaId,ideaTitle:room.title,commentId:c.id,actor:c.author,excerpt:c.text.slice(0,180),createdAt:new Date().toISOString(),readAt:null,pushState:state.mutedRooms?.[userId]?.includes(c.ideaId)?"sent":"pending"});}}
  editComment(id:string,commentId:string,user:Author,input:EditCommentInput){return this.store.transact(state=>{const c=state.comments.find(c=>c.ideaId===id&&c.id===commentId);if(!c)throw notFound();if(c.author.id!==user.id)throw new AppError(403,"NOT_AUTHOR","Bạn chỉ có thể sửa bình luận của mình");if((c.revision??0)!==input.revision)throw new AppError(409,"EDIT_CONFLICT","Bình luận đã thay đổi trên thiết bị khác. Sao chép bản đang sửa rồi tải lại bình luận");if(!input.text&&!c.attachments?.length)throw new AppError(422,"EMPTY_COMMENT","Nhập nội dung bình luận");const mentions=checkMentions(input.text,input.mentions,this.members(state,id)),old=c.mentions??[];if(c.text===input.text&&sameMentions(old,mentions))return c;c.text=input.text;c.mentions=mentions;c.editedAt=new Date().toISOString();c.revision=(c.revision??0)+1;const room=state.ideas.find(i=>i.id===id)!;room.discussionVersion=(room.discussionVersion??0)+1;for(const n of state.notifications??[])if(n.commentId===c.id)n.excerpt=c.text.slice(0,180);this.notify(state,c,undefined,old);return c;});}
  getCommentContext(ideaId:string,commentId:string){return this.store.read(state=>{
    const items:Comment[]=[],seen=new Set<string>();let id:string|null=commentId;
    while(id&&!seen.has(id)){seen.add(id);const c=state.comments.find(c=>c.ideaId===ideaId&&c.id===id);if(!c)throw notFound();items.push(c);id=c.parentId;}
    return items;
  });}
  notificationVersion(userId:string){return this.store.read(state=>{const all=(state.notifications??[]).filter(n=>n.userId===userId);return `${all.length}:${all.filter(n=>!n.readAt).length}`;});}
  listNotifications(userId:string,unreadOnly:boolean,offset:number){return this.store.read(state=>{const all=(state.notifications??[]).filter(n=>n.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)),filtered=all.filter(n=>!unreadOnly||!n.readAt);return {items:filtered.slice(offset,offset+30).map(({pushState:_s,pushAfter:_p,attempts:_a,...n})=>n),unread:all.filter(n=>!n.readAt).length,nextCursor:offset+30<filtered.length?String(offset+30):null};});}
  readNotifications(userId:string,ids:string[]|"all"){return this.store.transact(state=>{for(const n of state.notifications??[])if(n.userId===userId&&(ids==="all"||ids.includes(n.id)))n.readAt??=new Date().toISOString();});}
  roomMuted(id:string,userId:string){return this.store.read(state=>{this.members(state,id);return state.mutedRooms?.[userId]?.includes(id)??false;});}
  muteRoom(id:string,userId:string,muted:boolean){return this.store.transact(state=>{const room=state.ideas.find(i=>i.id===id);if(!room)throw notFound();if(!room.members.includes(userId))throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để đổi thông báo");const ids=new Set(state.mutedRooms?.[userId]??[]);if(muted)ids.add(id);else ids.delete(id);(state.mutedRooms??={})[userId]=[...ids];});}
  pushKeys(){return this.store.transact(state=>{if(!state.pushKeys){const ec=createECDH("prime256v1");ec.generateKeys();state.pushKeys={publicKey:ec.getPublicKey().toString("base64url"),privateKey:ec.getPrivateKey().toString("base64url")};}return state.pushKeys;});}
  savePush(userId:string,subscription:PushRegistration){return this.store.transact(state=>{state.pushSubscriptions=(state.pushSubscriptions??[]).filter(s=>s.endpoint!==subscription.endpoint);state.pushSubscriptions.push({...subscription,userId});});}
  removePush(userId:string,endpoint:string){return this.store.transact(state=>{state.pushSubscriptions=(state.pushSubscriptions??[]).filter(s=>s.userId!==userId||s.endpoint!==endpoint);});}
  subscriptions(userId:string){return this.store.read(state=>(state.pushSubscriptions??[]).filter(s=>s.userId===userId).map(({userId:_u,...s})=>s));}
  claimPush(){return this.store.transact(state=>{const jobs=(state.notifications??[]).filter(n=>n.pushState==="pending"&&(n.pushAfter??0)<Date.now()&&(n.attempts??0)<5).slice(0,20);for(const n of jobs){n.pushAfter=Date.now()+120000;n.attempts=(n.attempts??0)+1;}return jobs;});}
  finishPush(id:string,retry:boolean){return this.store.transact(state=>{const n=state.notifications?.find(n=>n.id===id);if(n){n.pushState=retry?"pending":"sent";n.pushAfter=Date.now()+60000;}});}
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
      const latest=new Map<string,string>();
      for(const c of state.comments)if(before(c.createdAt)&&(!latest.has(c.ideaId)||Date.parse(c.createdAt)>Date.parse(latest.get(c.ideaId)!)))latest.set(c.ideaId,c.createdAt);
      const ranked = state.ideas.filter(i => before(i.createdAt)).map(i => {
        const item = present(i, state, userId);
        const joined = i.members.includes(userId) && before(i.memberJoinedAt?.[userId]);
        return { item: { ...item, lastCommentAt:latest.get(i.id)??null, joined, notificationsMuted:joined && !!item.notificationsMuted, status: !joined ? "new" as const : i.memberArchived?.[userId] ? "archived" as const : "potential" as const },
          sortAt:query.sort==="activity"?(latest.get(i.id)??i.createdAt):i.createdAt,
          rank: query.sort === "popular" ? i.members.filter(id => before(i.memberJoinedAt?.[id])).length : 0 };
      });
      const counts = { all: ranked.length, new: ranked.filter(p => p.item.status === "new").length,
        potential: ranked.filter(p => p.item.status === "potential").length, archived: ranked.filter(p => p.item.status === "archived").length,
        mine: ranked.filter(p => p.item.mine).length };
      const filtered = ranked.filter(({ item: i }) => (query.view === "all" || (query.view === "mine" ? i.mine : i.status === query.view)) && normalize([i.title, i.description, ...i.tags].join(" ")).includes(q));
      const compare = (a: {rank: number; sortAt: string; id: string}, b: {rank: number; sortAt: string; id: string}) =>
        b.rank - a.rank || Date.parse(b.sortAt) - Date.parse(a.sortAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      filtered.sort((a, b) => compare({ ...a.item, sortAt:a.sortAt, rank: a.rank }, { ...b.item, sortAt:b.sortAt, rank: b.rank }));
      const remaining = cursor ? filtered.filter(({ item, rank, sortAt }) => compare({ ...item, rank, sortAt }, { ...cursor, sortAt:cursor.activityAt??cursor.createdAt, rank: cursor.members }) > 0) : filtered.slice(query.offset);
      const page = remaining.slice(0, query.limit), last = page.at(-1);
      return { items: page.map(p => p.item), total: filtered.length, counts,
        nextCursor: remaining.length > query.limit && last ? writeIdeaCursor(userId, query, { snapshot, createdAt: last.item.createdAt, id: last.item.id, members: last.rank, ...(query.sort==="activity"?{activityAt:last.sortAt}:{}) }) : null };
    });
  }
  getIdea(id: string, userId: string) {
    return this.store.read(state => { const idea = state.ideas.find(i => i.id === id); if (!idea) throw notFound(); return present(idea, state, userId); });
  }
  createIdea(user: Author, input: CreateIdeaInput) {
    return this.store.transact(state => {
      const idea: IdeaRecord = { ...input, category: input.category ?? "Khác", id: randomUUID(), creator: user, createdAt: new Date().toISOString(), tags: [...new Set(input.tags)].slice(0, 12), members: [user.id] };
      state.users=(state.users??[]).filter(u=>u.id!==user.id);state.users.push(user);
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
  joinIdea(id: string, userId: string,user?:Author) {
    return this.store.transact(state => {
      const idea = state.ideas.find(i => i.id === id); if (!idea) throw notFound();
      if(user){state.users=(state.users??[]).filter(u=>u.id!==userId);state.users.push(user);}
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
      const mentions=checkMentions(input.text,input.mentions,this.members(state,ideaId));
      const parentId = input.parentId ?? null;
      if(input.clientId){
        const existing=state.comments.find(c=>c.id===input.clientId);
        if(existing){if(existing.ideaId!==ideaId||existing.author.id!==user.id||existing.parentId!==parentId||existing.text!==input.text||!sameMentions(existing.mentions,mentions)||JSON.stringify(existing.attachments?.map(a=>a.id)??[])!==JSON.stringify(input.attachmentIds??[]))throw new AppError(409,"COMMENT_CONFLICT","Mã gửi bình luận đã được dùng");return existing;}
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
      const comment: Comment = { id: input.clientId ?? randomUUID(), ideaId, parentId, author: user, text: input.text, mentions,revision:0,createdAt: new Date().toISOString(),readCursor:String(state.comments.length+1),...(receipts.length?{attachments:receipts.map(publicAttachment)}:{}) };
      for(const receipt of receipts)receipt.commentId=comment.id;
      if (!idea.members.includes(user.id)) { idea.members.push(user.id); (idea.memberJoinedAt ??= {})[user.id] = new Date().toISOString(); (idea.memberReadCursor??={})[user.id]="0"; }
      state.comments.push(comment);this.notify(state,comment,state.comments.find(c=>c.id===parentId));return comment;
    });
  }
}
