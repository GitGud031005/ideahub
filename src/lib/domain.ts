export const CATEGORIES = ["Công nghệ", "Đời sống", "Học tập", "Thiết kế", "Khác"] as const;
export const IDEA_STATUSES = ["new", "potential", "archived"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];
export type JoinedIdeaStatus = Exclude<IdeaStatus, "new">;
export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = { new: "Mới", potential: "Tiềm năng", archived: "Lưu trữ" };
export type Category = (typeof CATEGORIES)[number];
export type StorageMode = "json" | "memory" | "postgres";
export interface Author { id: string; name: string; initial: string; avatarUrl?: string | null }
export interface Idea {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  category: Category;
  tags: string[];
  creator: Author;
  createdAt: string;
  memberCount: number;
  commentCount: number;
  lastCommentAt: string | null;
  joined: boolean;
  mine: boolean;
  /** Viewer preference; omitted by older clients means notifications are enabled. */
  notificationsMuted?: boolean;
}
export interface Comment {
  id: string;
  ideaId: string;
  parentId: string | null;
  author: Author;
  text: string;
  createdAt: string;
  readCursor?: string;
  attachments?: Attachment[];
  pinnedAt?: string | null;
  mentions?:Mention[];editedAt?:string|null;revision?:number;
}
export interface Mention {userId:string;name:string;start:number;end:number}
export interface EditCommentInput {text:string;mentions?:Mention[];revision:number}
export interface RoomNotification {id:string;userId:string;ideaId:string;ideaTitle:string;commentId:string;actor:Author;kind:"mention"|"reply"|"message";excerpt:string;createdAt:string;readAt:string|null}
export interface NotificationsPage {items:RoomNotification[];unread:number;nextCursor:string|null}
export interface PushRegistration {endpoint:string;keys:{p256dh:string;auth:string}}
export interface Attachment { id:string; name:string; mime:string; size:number; kind:"image"|"file"; url:string }
export type UnreadCounts = Record<string, number>;
export interface RoomActivity { commentCount:number; memberCount:number; version?:string }
export interface CreateIdeaInput { title: string; description: string; tags: string[]; /** @deprecated Legacy clients only; never added to tags. */ category?: Category }
export interface CreateCommentInput { text: string; parentId?: string | null; clientId?: string; attachmentIds?:string[];mentions?:Mention[] }
export type IdeaView = "all" | "new" | "potential" | "archived" | "mine";
export type IdeaSort = "activity" | "new" | "popular";
export type CommentSort = "old" | "new";
export interface IdeaQuery { q: string; view: IdeaView; sort: IdeaSort; limit: number; offset: number; cursor?: string }
export interface IdeasPage { items: Idea[]; total: number; counts: Record<IdeaView, number>; nextCursor: string | null }
export interface CommentsPage { items: Comment[]; total: number; nextCursor: string | null }
export interface Account extends Author { username: string; provider?: "password" | "google"; avatarSource?: "initials" | "google" | "custom" }
export interface Session { user: Account | null; storage: StorageMode }
export interface ApiErrorPayload { error: { code: string; message: string; fields?: Record<string, string[]> } }
