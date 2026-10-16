export const CATEGORIES = ["Công nghệ", "Đời sống", "Học tập", "Thiết kế", "Khác"] as const;
export type Category = (typeof CATEGORIES)[number];
export type StorageMode = "json" | "memory";
export interface Author { id: string; name: string; initial: string }
export interface Idea {
  id: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  creator: Author;
  createdAt: string;
  memberCount: number;
  commentCount: number;
  joined: boolean;
  mine: boolean;
}
export interface Comment {
  id: string;
  ideaId: string;
  parentId: string | null;
  author: Author;
  text: string;
  createdAt: string;
}
export interface CreateIdeaInput { title: string; description: string; category: Category; tags: string[] }
export interface CreateCommentInput { text: string; parentId?: string | null }
export type IdeaView = "all" | "joined" | "mine";
export type IdeaSort = "new" | "popular";
export type CommentSort = "old" | "new";
export interface IdeaQuery { q: string; view: IdeaView; sort: IdeaSort; limit: number; offset: number }
export interface IdeasPage { items: Idea[]; total: number; counts: Record<IdeaView, number> }
export interface CommentsPage { items: Comment[]; total: number; nextCursor: string | null }
export interface Session { user: Author; storage: StorageMode }
export interface ApiErrorPayload { error: { code: string; message: string; fields?: Record<string, string[]> } }
