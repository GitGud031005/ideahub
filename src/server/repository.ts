import { randomUUID } from "node:crypto";
import type { Author, Comment, CommentsPage, CreateCommentInput, CreateIdeaInput, Idea, IdeaQuery, IdeasPage } from "@/lib/domain";
import { normalize } from "@/lib/format";
import { AppError, notFound } from "./errors";
import type { DataState, IdeaRecord, StateStore } from "./state";

/** Shared storage contract implemented by state and PostgreSQL repositories. */
export interface IdeaRepository {
  listIdeas(userId: string, query: IdeaQuery): Promise<IdeasPage>;
  getIdea(id: string, userId: string): Promise<Idea>;
  createIdea(user: Author, input: CreateIdeaInput): Promise<Idea>;
  joinIdea(id: string, userId: string): Promise<Idea>;
  listComments(ideaId: string, cursor?: string, limit?: number): Promise<CommentsPage>;
  createComment(ideaId: string, user: Author, input: CreateCommentInput): Promise<Comment>;
}
function present(idea: IdeaRecord, state: DataState, userId: string): Idea {
  const { members, ...record } = idea;
  return { ...record, memberCount: members.length, commentCount: state.comments.filter(c => c.ideaId === idea.id).length, joined: members.includes(userId), mine: idea.creator.id === userId };
}
export class StateIdeaRepository implements IdeaRepository {
  constructor(private store: StateStore) {}
  listIdeas(userId: string, query: IdeaQuery) {
    return this.store.read(state => {
      const all = state.ideas.map(i => present(i, state, userId));
      const q = normalize(query.q);
      const filtered = all.filter(i => (query.view === "all" || (query.view === "joined" ? i.joined : i.mine)) && normalize([i.title, i.description, ...i.tags].join(" ")).includes(q));
      filtered.sort((a, b) => (query.sort === "popular" ? b.memberCount - a.memberCount : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
      return { items: filtered.slice(query.offset, query.offset + query.limit), total: filtered.length, counts: { all: all.length, joined: all.filter(i => i.joined).length, mine: all.filter(i => i.mine).length } };
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
  joinIdea(id: string, userId: string) {
    return this.store.transact(state => {
      const idea = state.ideas.find(i => i.id === id); if (!idea) throw notFound();
      if (!idea.members.includes(userId)) idea.members.push(userId);
      return present(idea, state, userId);
    });
  }
  listComments(ideaId: string, cursor?: string, limit = 100) {
    return this.store.read(state => {
      if (!state.ideas.some(i => i.id === ideaId)) throw notFound();
      const all = state.comments.filter(c => c.ideaId === ideaId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id));
      const index = cursor ? all.findIndex(c => c.id === cursor) : -1;
      if (cursor && index < 0) throw new AppError(400, "INVALID_CURSOR", "Vị trí bình luận không hợp lệ");
      const items = all.slice(index + 1, index + 1 + limit);
      return { items, total: all.length, nextCursor: index + 1 + items.length < all.length ? items.at(-1)?.id ?? null : null };
    });
  }
  createComment(ideaId: string, user: Author, input: CreateCommentInput) {
    return this.store.transact(state => {
      const idea = state.ideas.find(i => i.id === ideaId); if (!idea) throw notFound();
      const parentId = input.parentId ?? null;
      if(input.clientId){
        const existing=state.comments.find(c=>c.id===input.clientId);
        if(existing){if(existing.ideaId!==ideaId||existing.author.id!==user.id||existing.parentId!==parentId||existing.text!==input.text)throw new AppError(409,"COMMENT_CONFLICT","Mã gửi bình luận đã được dùng");return existing;}
      }
      let parent = parentId, depth = 0;
      const seen = new Set<string>();
      while (parent) {
        const entry = state.comments.find(c => c.id === parent && c.ideaId === ideaId);
        if (!entry) throw new AppError(400, "INVALID_PARENT", "Bình luận gốc không thuộc cuộc thảo luận này");
        if (seen.has(parent) || ++depth > 12) throw new AppError(422, "MAX_DEPTH", "Nhánh trả lời đã quá sâu, hãy trả lời một bình luận gần hơn");
        seen.add(parent); parent = entry.parentId;
      }
      const comment: Comment = { id: input.clientId ?? randomUUID(), ideaId, parentId, author: user, text: input.text, createdAt: new Date().toISOString() };
      if (!idea.members.includes(user.id)) idea.members.push(user.id);
      state.comments.push(comment); return comment;
    });
  }
}
