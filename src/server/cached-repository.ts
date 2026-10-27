import type { Author, EditCommentInput, PushRegistration, CreateCommentInput, CreateIdeaInput, IdeaQuery, JoinedIdeaStatus } from "@/lib/domain";
import type { IdeaRepository } from "./repository";
import { RedisCache } from "./redis-cache";
import type { StoredAttachment } from "./attachment-record";

/** Never cache authentication, personal read markers, or viewer-specific idea responses. */
export class CachedIdeaRepository implements IdeaRepository {
  constructor(private inner:IdeaRepository,private cache:RedisCache){}
  listMembers(id:string,userId:string){return this.inner.listMembers(id,userId);}
  searchComments(id:string,userId:string,q:string,authorId:string,offset:number){return this.inner.searchComments(id,userId,q,authorId,offset);}
  async editComment(id:string,commentId:string,user:Author,input:EditCommentInput){const c=await this.inner.editComment(id,commentId,user,input);await this.cache.invalidate();return c;}
  notificationVersion(userId:string){return this.inner.notificationVersion(userId);}
  getCommentContext(ideaId:string,commentId:string){return this.inner.getCommentContext(ideaId,commentId);}
  listNotifications(userId:string,unreadOnly:boolean,offset:number){return this.inner.listNotifications(userId,unreadOnly,offset);}
  readNotifications(userId:string,ids:string[]|"all"){return this.inner.readNotifications(userId,ids);}
  roomMuted(id:string,userId:string){return this.inner.roomMuted(id,userId);}
  muteRoom(id:string,userId:string,muted:boolean){return this.inner.muteRoom(id,userId,muted);}
  pushKeys(){return this.inner.pushKeys();}
  savePush(userId:string,s:PushRegistration){return this.inner.savePush(userId,s);}
  removePush(userId:string,endpoint:string){return this.inner.removePush(userId,endpoint);}
  subscriptions(userId:string){return this.inner.subscriptions(userId);}
  claimPush(){return this.inner.claimPush();}
  finishPush(id:string,retry:boolean){return this.inner.finishPush(id,retry);}
  listIdeas(userId:string,query:IdeaQuery){return this.inner.listIdeas(userId,query);}
  setIdeaStatus(id:string,userId:string,status:JoinedIdeaStatus){return this.inner.setIdeaStatus(id,userId,status);}
  getIdea(id:string,userId:string){return this.inner.getIdea(id,userId);}
  unreadCounts(userId:string){return this.inner.unreadCounts(userId);}
  unreadCommentIds(id:string,userId:string){return this.inner.unreadCommentIds(id,userId);}
  markRead(id:string,userId:string,commentIds:string|string[]){return this.inner.markRead(id,userId,commentIds);}
  saveAttachment(a:StoredAttachment){return this.inner.saveAttachment(a);}
  getAttachment(ideaId:string,id:string,userId:string){return this.inner.getAttachment(ideaId,id,userId);}
  async pinComment(ideaId:string,id:string,userId:string,pinned:boolean){await this.inner.pinComment(ideaId,id,userId,pinned);await this.cache.invalidate();}
  getActivity(id:string){return this.cache.remember(`activity:${id}`,2,()=>this.inner.getActivity(id));}
  listComments(id:string,cursor?:string,limit=100){return this.cache.remember(`comments:${id}:${cursor??""}:${limit}`,5,()=>this.inner.listComments(id,cursor,limit));}
  async createIdea(user:Author,input:CreateIdeaInput){const idea=await this.inner.createIdea(user,input);await this.cache.invalidate();return idea;}
  async joinIdea(id:string,userId:string,user?:Author){const idea=await this.inner.joinIdea(id,userId,user);await this.cache.invalidate();return idea;}
  async createComment(id:string,user:Author,input:CreateCommentInput){const comment=await this.inner.createComment(id,user,input);await this.cache.invalidate();return comment;}
}
