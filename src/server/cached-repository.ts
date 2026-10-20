import type { Author, CreateCommentInput, CreateIdeaInput, IdeaQuery, JoinedIdeaStatus } from "@/lib/domain";
import type { IdeaRepository } from "./repository";
import { RedisCache } from "./redis-cache";
import type { StoredAttachment } from "./attachment-record";

/** Never cache authentication, personal read markers, or viewer-specific idea responses. */
export class CachedIdeaRepository implements IdeaRepository {
  constructor(private inner:IdeaRepository,private cache:RedisCache){}
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
  async joinIdea(id:string,userId:string){const idea=await this.inner.joinIdea(id,userId);await this.cache.invalidate();return idea;}
  async createComment(id:string,user:Author,input:CreateCommentInput){const comment=await this.inner.createComment(id,user,input);await this.cache.invalidate();return comment;}
}
