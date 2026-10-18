import type { Author, CreateCommentInput, CreateIdeaInput, IdeaQuery } from "@/lib/domain";
import type { IdeaRepository } from "./repository";
import { RedisCache } from "./redis-cache";

/** Never cache authentication, personal read markers, or viewer-specific idea responses. */
export class CachedIdeaRepository implements IdeaRepository {
  constructor(private inner:IdeaRepository,private cache:RedisCache){}
  listIdeas(userId:string,query:IdeaQuery){return this.inner.listIdeas(userId,query);}
  getIdea(id:string,userId:string){return this.inner.getIdea(id,userId);}
  unreadCounts(userId:string){return this.inner.unreadCounts(userId);}
  markRead(id:string,userId:string,commentId:string){return this.inner.markRead(id,userId,commentId);}
  getActivity(id:string){return this.cache.remember(`activity:${id}`,2,()=>this.inner.getActivity(id));}
  listComments(id:string,cursor?:string,limit=100){return this.cache.remember(`comments:${id}:${cursor??""}:${limit}`,5,()=>this.inner.listComments(id,cursor,limit));}
  async createIdea(user:Author,input:CreateIdeaInput){const idea=await this.inner.createIdea(user,input);await this.cache.invalidate();return idea;}
  async joinIdea(id:string,userId:string){const idea=await this.inner.joinIdea(id,userId);await this.cache.invalidate();return idea;}
  async createComment(id:string,user:Author,input:CreateCommentInput){const comment=await this.inner.createComment(id,user,input);await this.cache.invalidate();return comment;}
}
