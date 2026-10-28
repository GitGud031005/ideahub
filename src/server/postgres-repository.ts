import {checkMentions,notificationRecipients,type StoredNotification} from "./collaboration";
import {sameMentions} from "@/lib/mentions";
import { randomUUID, createECDH } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Author, EditCommentInput, Mention, NotificationsPage, PushRegistration, RoomNotification, Category, Comment, CommentsPage, CreateCommentInput, CreateIdeaInput, Idea, IdeaQuery, IdeasPage, IdeaStatus, JoinedIdeaStatus, UnreadCounts } from "@/lib/domain";
import { normalize } from "@/lib/format";
import { AppError, notFound } from "./errors";
import type { IdeaRepository } from "./repository";
import { readIdeaCursor, writeIdeaCursor } from "./idea-pagination";
import type { Attachment } from "@/lib/domain";
import type { StoredAttachment } from "./attachment-record";

export interface DatabaseExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}
export interface DatabaseClient extends DatabaseExecutor { release(destroy?: boolean): void }
export interface DatabasePool extends DatabaseExecutor { connect(): Promise<DatabaseClient> }
type Executor = DatabaseExecutor;
interface IdeaRow {
  status: IdeaStatus;
  id: string; title: string; description: string; category: Category; tags: string[];
  creator_id: string; display_name: string; initial: string; avatar_url: string | null; created_at: Date;
  member_count: number; comment_count: number; joined: boolean; mine: boolean; notifications_muted: boolean;
  cursor_time: string; rank_members?: number; last_comment_at: Date | null; cursor_activity?:string;
}
interface CommentRow {
  id: string; idea_id: string; parent_id: string | null; author_id: string;
  display_name: string; initial: string; avatar_url: string | null; body: string; created_at: Date; read_sequence:string;
  mentions:Mention[];edited_at:Date|null;revision:number;
  attachments:Attachment[]; pinned_at:Date|null;
}
const IDEA_SELECT = `SELECT i.id, CASE WHEN viewer.user_id IS NULL THEN 'new' WHEN viewer.archived THEN 'archived' ELSE 'potential' END AS status, i.title, i.description, i.category, i.tags, i.creator_id,
  u.display_name, u.initial, u.avatar_url, i.created_at,
  to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
  (SELECT count(*)::int FROM public.memberships m WHERE m.idea_id = i.id) AS member_count,
  (SELECT count(*)::int FROM public.comments c WHERE c.idea_id = i.id) AS comment_count,
  (SELECT c.created_at FROM public.comments c WHERE c.idea_id = i.id ORDER BY c.created_at DESC LIMIT 1) AS last_comment_at,
  (viewer.user_id IS NOT NULL) AS joined,
  COALESCE(viewer.notifications_muted, false) AS notifications_muted,
  i.creator_id = $1 AS mine
  FROM public.ideas i JOIN public.users u ON u.id = i.creator_id
  LEFT JOIN public.memberships viewer ON viewer.idea_id = i.id AND viewer.user_id = $1`;
const COMMENT_SELECT = `SELECT c.id, c.idea_id, c.parent_id, c.author_id, c.body, c.created_at, c.read_sequence::text,c.attachments,c.pinned_at,c.mentions,c.edited_at,c.revision,
  u.display_name, u.initial, u.avatar_url FROM public.comments c JOIN public.users u ON u.id = c.author_id`;
function idea(row: IdeaRow): Idea {
  return { id: row.id, status: row.status, title: row.title, description: row.description, category: row.category, tags: row.tags,
    creator: { id: row.creator_id, name: row.display_name, initial: row.initial, avatarUrl: row.avatar_url }, createdAt: row.created_at.toISOString(),
    memberCount: row.member_count, commentCount: row.comment_count, lastCommentAt: row.last_comment_at?.toISOString()??null, joined: row.joined, mine: row.mine, notificationsMuted: row.notifications_muted };
}
function comment(row: CommentRow): Comment {
  return { id: row.id, ideaId: row.idea_id, parentId: row.parent_id, text: row.body,
    author: { id: row.author_id, name: row.display_name, initial: row.initial, avatarUrl: row.avatar_url }, createdAt: row.created_at.toISOString(),readCursor:row.read_sequence,
    mentions:row.mentions??[],editedAt:row.edited_at?.toISOString()??null,revision:row.revision??0,
    ...(row.attachments?.length?{attachments:row.attachments}:{}),...(row.pinned_at?{pinnedAt:row.pinned_at.toISOString()}:{}) };
}
async function ensureUser(db: Executor, user: Author) {
  await db.query(`INSERT INTO public.users (id, display_name, initial) VALUES ($1, $2, $3)
    ON CONFLICT (id) DO NOTHING`, [user.id, user.name, user.initial]);
}
async function getIdea(db: Executor, id: string, userId: string): Promise<Idea> {
  const result = await db.query<IdeaRow>(`${IDEA_SELECT} WHERE i.id = $2`, [userId, id]);
  if (!result.rows[0]) throw notFound();
  return idea(result.rows[0]);
}
async function requireIdea(db: Executor, id: string) {
  const result = await db.query("SELECT id FROM public.ideas WHERE id = $1 FOR KEY SHARE", [id]);
  if (!result.rowCount) throw notFound();
}

/** SQL is parameterized and unnamed, compatible with Supabase transaction pooling. */
export class PostgresIdeaRepository implements IdeaRepository {
  constructor(private pool: DatabasePool) {}
  private async transaction<T>(work: (client: DatabaseClient) => Promise<T>, readOnly = false): Promise<T> {
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { broken = true; }
      throw error;
    } finally { client.release(broken); }
  }
  async listMembers(ideaId:string,userId:string):Promise<Author[]>{await getIdea(this.pool,ideaId,userId);const r=await this.pool.query(`SELECT u.id,u.display_name,u.initial,u.avatar_url FROM public.memberships m JOIN public.users u ON u.id=m.user_id WHERE m.idea_id=$1 ORDER BY u.display_name,u.id`,[ideaId]);return r.rows.map(u=>({id:u.id,name:u.display_name,initial:u.initial,avatarUrl:u.avatar_url}));}
  async searchComments(id:string,userId:string,q:string,authorId:string,offset:number):Promise<CommentsPage>{await getIdea(this.pool,id,userId);const values=[id,normalize(q),authorId,offset];const r=await this.pool.query<CommentRow>(`${COMMENT_SELECT} WHERE c.idea_id=$1 AND strpos(c.search_text,$2)>0 AND ($3='' OR c.author_id=$3) ORDER BY c.created_at DESC,c.id DESC LIMIT 31 OFFSET $4`,values);const total=(await this.pool.query<{total:number}>(`SELECT count(*)::int AS total FROM public.comments WHERE idea_id=$1 AND strpos(search_text,$2)>0 AND ($3='' OR author_id=$3)`,values.slice(0,3))).rows[0].total;return {items:r.rows.slice(0,30).map(comment),total,nextCursor:r.rows.length>30?String(offset+30):null};}
  private async notify(db:Executor,c:Comment,parent?:Comment,old:Mention[]|undefined=undefined){
    const members=old===undefined?(await db.query<{user_id:string}>("SELECT user_id FROM public.memberships WHERE idea_id=$1",[c.ideaId])).rows.map(m=>m.user_id):[];
    const recipients=[...notificationRecipients(c,parent,old,members)];if(!recipients.length)return;
    await db.query(`INSERT INTO ideahub_private.notifications(id,user_id,idea_id,comment_id,actor_id,kind,push_state)
      SELECT recipient.id,recipient.user_id,$1,$2,$3,recipient.kind,CASE WHEN membership.notifications_muted THEN 'sent' ELSE 'pending' END
      FROM unnest($4::text[],$5::text[],$6::text[]) AS recipient(id,user_id,kind)
      JOIN public.memberships membership ON membership.idea_id=$1 AND membership.user_id=recipient.user_id
      ON CONFLICT(user_id,comment_id) DO NOTHING`,[c.ideaId,c.id,c.author.id,recipients.map(()=>randomUUID()),recipients.map(([id])=>id),recipients.map(([,kind])=>kind)]);
  }
  editComment(ideaId:string,commentId:string,user:Author,input:EditCommentInput){return this.transaction(async db=>{await db.query("SELECT id FROM public.ideas WHERE id=$1 FOR UPDATE",[ideaId]);const row=(await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.idea_id=$1 AND c.id=$2 FOR UPDATE OF c`,[ideaId,commentId])).rows[0];if(!row)throw notFound();if(row.author_id!==user.id)throw new AppError(403,"NOT_AUTHOR","Bạn chỉ có thể sửa bình luận của mình");if(row.revision!==input.revision)throw new AppError(409,"EDIT_CONFLICT","Bình luận đã thay đổi trên thiết bị khác. Sao chép bản đang sửa rồi tải lại bình luận");if(!input.text&&!row.attachments.length)throw new AppError(422,"EMPTY_COMMENT","Nhập nội dung bình luận");const members=(await db.query(`SELECT user_id FROM public.memberships WHERE idea_id=$1`,[ideaId])).rows.map(u=>({id:u.user_id,name:"",initial:""}));const mentions=checkMentions(input.text,input.mentions,members);if(row.body===input.text&&sameMentions(row.mentions,mentions))return comment(row);await db.query(`UPDATE public.comments SET body=$3,mentions=$4::jsonb,search_text=$5,edited_at=clock_timestamp(),revision=revision+1 WHERE idea_id=$1 AND id=$2`,[ideaId,commentId,input.text,JSON.stringify(mentions),normalize(input.text)]);await db.query("UPDATE public.ideas SET discussion_version=discussion_version+1 WHERE id=$1",[ideaId]);const updated=comment((await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id=$1`,[commentId])).rows[0]);await this.notify(db,updated,undefined,row.mentions);return updated;});}
  private notification(n:QueryResultRow):RoomNotification{return {id:n.id,userId:n.user_id,ideaId:n.idea_id,ideaTitle:n.title,commentId:n.comment_id,actor:{id:n.actor_id,name:n.display_name,initial:n.initial,avatarUrl:n.avatar_url},kind:n.kind,excerpt:n.body.slice(0,180),createdAt:n.created_at.toISOString(),readAt:n.read_at?.toISOString()??null};}
  async getCommentContext(ideaId:string,commentId:string){
    const result=await this.pool.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id IN (WITH RECURSIVE branch AS (
      SELECT id,parent_id,1 AS depth FROM public.comments WHERE idea_id=$1 AND id=$2
      UNION ALL SELECT p.id,p.parent_id,b.depth+1 FROM public.comments p JOIN branch b ON p.id=b.parent_id WHERE p.idea_id=$1 AND b.depth<13
    ) SELECT id FROM branch)`,[ideaId,commentId]);
    if(!result.rows.some(c=>c.id===commentId))throw notFound();return result.rows.map(comment);
  }
  async notificationVersion(userId:string){const row=(await this.pool.query<{version:string}>("SELECT count(*)::text||':'||count(*) FILTER (WHERE read_at IS NULL)::text AS version FROM ideahub_private.notifications WHERE user_id=$1",[userId])).rows[0];return row.version;}
  async listNotifications(userId:string,unreadOnly:boolean,offset:number):Promise<NotificationsPage>{const rows=(await this.pool.query(`SELECT n.*,i.title,c.body,u.display_name,u.initial,u.avatar_url FROM ideahub_private.notifications n JOIN public.ideas i ON i.id=n.idea_id JOIN public.comments c ON c.id=n.comment_id JOIN public.users u ON u.id=n.actor_id WHERE n.user_id=$1 AND (NOT $2::boolean OR n.read_at IS NULL) ORDER BY n.created_at DESC,n.id DESC LIMIT 31 OFFSET $3`,[userId,unreadOnly,offset])).rows;const unread=(await this.pool.query<{total:number}>("SELECT count(*)::int AS total FROM ideahub_private.notifications WHERE user_id=$1 AND read_at IS NULL",[userId])).rows[0].total;return {items:rows.slice(0,30).map(n=>this.notification(n)),unread,nextCursor:rows.length>30?String(offset+30):null};}
  async readNotifications(userId:string,ids:string[]|"all"){await this.pool.query("UPDATE ideahub_private.notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND ($2::boolean OR id=ANY($3::text[]))",[userId,ids==="all",ids==="all"?[]:ids]);}
  async roomMuted(id:string,userId:string){const r=await this.pool.query<{notifications_muted:boolean}>("SELECT notifications_muted FROM public.memberships WHERE idea_id=$1 AND user_id=$2",[id,userId]);return r.rows[0]?.notifications_muted??false;}
  async muteRoom(id:string,userId:string,muted:boolean){if(!(await this.pool.query("UPDATE public.memberships SET notifications_muted=$3 WHERE idea_id=$1 AND user_id=$2",[id,userId,muted])).rowCount)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để đổi thông báo");}
  async pushUnread(id:string,userId:string){return !!(await this.pool.query("SELECT 1 FROM ideahub_private.notifications WHERE id=$1 AND user_id=$2 AND read_at IS NULL AND push_state='pending'",[id,userId])).rowCount;}
  async pushKeys(){const ec=createECDH("prime256v1");ec.generateKeys();await this.pool.query("INSERT INTO ideahub_private.push_keys(singleton,public_key,private_key) VALUES(true,$1,$2) ON CONFLICT DO NOTHING",[ec.getPublicKey().toString("base64url"),ec.getPrivateKey().toString("base64url")]);const row=(await this.pool.query<{public_key:string;private_key:string}>("SELECT public_key,private_key FROM ideahub_private.push_keys WHERE singleton=true")).rows[0];return {publicKey:row.public_key,privateKey:row.private_key};}
  async savePush(userId:string,s:PushRegistration){await this.pool.query(`INSERT INTO ideahub_private.push_subscriptions(endpoint,user_id,p256dh,auth) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET user_id=$2,p256dh=$3,auth=$4`,[s.endpoint,userId,s.keys.p256dh,s.keys.auth]);}
  async removePush(userId:string,endpoint:string){await this.pool.query("DELETE FROM ideahub_private.push_subscriptions WHERE user_id=$1 AND endpoint=$2",[userId,endpoint]);}
  async subscriptions(userId:string){return (await this.pool.query<{endpoint:string;p256dh:string;auth:string}>("SELECT endpoint,p256dh,auth FROM ideahub_private.push_subscriptions WHERE user_id=$1",[userId])).rows.map(s=>({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}}));}
  async claimPush():Promise<StoredNotification[]>{const rows=(await this.pool.query(`WITH jobs AS (SELECT id FROM ideahub_private.notifications WHERE push_state='pending' AND push_after<now() AND attempts<5 ORDER BY push_after LIMIT 20 FOR UPDATE SKIP LOCKED), claimed AS (UPDATE ideahub_private.notifications n SET attempts=attempts+1,push_after=now()+interval '120 seconds' FROM jobs WHERE n.id=jobs.id RETURNING n.*) SELECT n.*,i.title,c.body,u.display_name,u.initial,u.avatar_url FROM claimed n JOIN public.ideas i ON i.id=n.idea_id JOIN public.comments c ON c.id=n.comment_id JOIN public.users u ON u.id=n.actor_id`)).rows;return rows.map(n=>({...this.notification(n),attempts:n.attempts}));}
  async finishPush(id:string,retry:boolean){await this.pool.query("UPDATE ideahub_private.notifications SET push_state=$2,push_after=now()+interval '60 seconds' WHERE id=$1",[id,retry?"pending":"sent"]);}
  async listIdeas(userId: string, query: IdeaQuery): Promise<IdeasPage> {
    const cursor = readIdeaCursor(userId, query);
    return this.transaction(async db => {
      const snapshot = cursor?.snapshot ?? (await db.query<{ snapshot: string }>(`SELECT
        to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snapshot`)).rows[0].snapshot;
      const values = [userId, normalize(query.q), query.view, snapshot];
      const countRow = (await db.query<{ all:number; new:number; potential:number; archived:number; mine:number; total:number }>(`WITH visible AS (
        SELECT i.creator_id, i.search_text,
          CASE WHEN viewer.user_id IS NULL THEN 'new' WHEN viewer.archived THEN 'archived' ELSE 'potential' END AS status
        FROM public.ideas i LEFT JOIN public.memberships viewer ON viewer.idea_id = i.id AND viewer.user_id = $1 AND viewer.joined_at <= $4::timestamptz
        WHERE i.created_at <= $4::timestamptz
      ) SELECT count(*)::int AS all,
        count(*) FILTER (WHERE status = 'new')::int AS new,
        count(*) FILTER (WHERE status = 'potential')::int AS potential,
        count(*) FILTER (WHERE status = 'archived')::int AS archived,
        count(*) FILTER (WHERE creator_id = $1)::int AS mine,
        count(*) FILTER (WHERE strpos(search_text, $2) > 0 AND ($3 = 'all' OR ($3 = 'mine' AND creator_id = $1) OR status = $3))::int AS total
        FROM visible`, values)).rows[0];
      const { total, ...counts } = countRow;
      const where = `WHERE strpos(i.search_text, $2) > 0 AND i.created_at <= $4::timestamptz
        AND ($3 = 'all' OR ($3 = 'mine' AND i.creator_id = $1)
          OR ($3 = 'new' AND viewer.user_id IS NULL)
          OR ($3 = 'potential' AND viewer.user_id IS NOT NULL AND NOT viewer.archived)
          OR ($3 = 'archived' AND viewer.archived))`;
      // Freeze membership and message activity at the first page so writes do not move rows across its cursor.
      const rank = query.sort === "popular" ? `(SELECT count(*)::int FROM public.memberships m
        WHERE m.idea_id = i.id AND m.joined_at <= $4::timestamptz)` : "0";
      const selection=IDEA_SELECT.replace("SELECT i.id", `SELECT ${rank} AS rank_members, i.id`)
        .replace("viewer.user_id = $1", "viewer.user_id = $1 AND viewer.joined_at <= $4::timestamptz")
        .replace("ORDER BY c.created_at DESC LIMIT 1", "AND c.created_at <= $4::timestamptz ORDER BY c.created_at DESC LIMIT 1");
      const rankTime=query.sort==="activity"?"COALESCE(last_comment_at,created_at)":"created_at";
      const result = await db.query<IdeaRow>(`WITH base AS (${selection} ${where}), ranked AS (
        SELECT base.*, ${rankTime} AS rank_time FROM base
      ) SELECT *,to_char(rank_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_activity
        FROM ranked WHERE $5::text IS NULL OR rank_members < $6::int
        OR (rank_members = $6::int AND (rank_time < $7::timestamptz
          OR (rank_time = $7::timestamptz AND id COLLATE "C" > $5)))
        ORDER BY rank_members DESC, rank_time DESC, id COLLATE "C" ASC LIMIT $8 OFFSET $9`,
      [...values, cursor?.id ?? null, cursor?.members ?? 0, cursor?.activityAt ?? cursor?.createdAt ?? null, query.limit + 1, cursor ? 0 : query.offset]);
      const rows = result.rows.slice(0, query.limit), last = rows.at(-1);
      return { items: rows.map(idea), total, counts, nextCursor: result.rows.length > query.limit && last
        ? writeIdeaCursor(userId, query, { snapshot, id: last.id, createdAt: last.cursor_time, members: last.rank_members!, ...(query.sort==="activity"?{activityAt:last.cursor_activity!}:{}) }) : null };
    }, true);
  }
  getIdea(id: string, userId: string) { return getIdea(this.pool, id, userId); }
  async createIdea(user: Author, input: CreateIdeaInput): Promise<Idea> {
    return this.transaction(async db => {
      const id = randomUUID(), tags = [...new Set(input.tags)].slice(0, 12);
      await ensureUser(db, user);
      await db.query(`INSERT INTO public.ideas (id, title, description, category, tags, search_text, creator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, input.title, input.description, input.category ?? "Khác", tags, normalize([input.title, input.description, ...tags].join(" ")), user.id]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id) VALUES ($1, $2)", [id, user.id]);
      return getIdea(db, id, user.id);
    });
  }
  async setIdeaStatus(id: string, userId: string, status: JoinedIdeaStatus): Promise<Idea> {
    return this.transaction(async db => {
      await requireIdea(db, id);
      const result = await db.query(`UPDATE public.memberships SET archived = $3
        WHERE idea_id = $1 AND user_id = $2 RETURNING idea_id`, [id, userId, status === "archived"]);
      if (!result.rowCount) throw new AppError(403, "NOT_JOINED", "Tham gia ý tưởng để thay đổi phân loại");
      return getIdea(db, id, userId);
    });
  }
  async joinIdea(id: string, userId: string): Promise<Idea> {
    return this.transaction(async db => {
      await requireIdea(db, id);
      // Session identities are generated by the server; the route never accepts a caller-supplied user ID.
      await db.query(`INSERT INTO public.users (id, display_name, initial) VALUES ($1, $2, 'TV')
        ON CONFLICT (id) DO NOTHING`, [userId, `Thành viên ${userId.slice(0, 4)}`]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, userId]);
      return getIdea(db, id, userId);
    });
  }
  async listComments(ideaId: string, cursor?: string, limit = 100): Promise<CommentsPage> {
    // One statement has one MVCC snapshot: metadata and page stay consistent
    // without BEGIN/COMMIT and several sequential network round trips.
    type PageRow = { [K in keyof CommentRow]: CommentRow[K] | null } & {
      idea_exists: boolean; cursor_exists: boolean; total: number;
    };
    const result = await this.pool.query<PageRow>(`WITH metadata AS (
        SELECT EXISTS (SELECT 1 FROM public.ideas WHERE id=$1) AS idea_exists,
          ($2::text IS NULL OR EXISTS (SELECT 1 FROM public.comments WHERE idea_id=$1 AND id=$2)) AS cursor_exists,
          (SELECT count(*)::int FROM public.comments WHERE idea_id=$1) AS total
      ), page AS (
        ${COMMENT_SELECT} WHERE c.idea_id = $1
        AND ($2::text IS NULL OR (c.created_at, c.id COLLATE "C") >
          (SELECT created_at, id COLLATE "C" FROM public.comments WHERE idea_id = $1 AND id = $2))
        ORDER BY c.created_at, c.id COLLATE "C" LIMIT $3
      ) SELECT metadata.*, page.* FROM metadata LEFT JOIN page ON true
      ORDER BY page.created_at, page.id COLLATE "C"`, [ideaId, cursor ?? null, limit + 1]);
    const metadata = result.rows[0];
    if (!metadata.idea_exists) throw notFound();
    if (!metadata.cursor_exists) throw new AppError(400, "INVALID_CURSOR", "Vị trí bình luận không hợp lệ");
    const rows = result.rows.filter((row): row is PageRow & CommentRow => row.id !== null);
    const items = rows.slice(0, limit).map(comment);
    return { items, total: metadata.total, nextCursor: rows.length > limit ? items.at(-1)?.id ?? null : null };
  }
  getActivity(ideaId:string){return this.pool.query<{comment_count:number;member_count:number;version:string}>(`SELECT i.discussion_version::text AS version,
    (SELECT count(*)::int FROM public.comments c WHERE c.idea_id=i.id) AS comment_count,
    (SELECT count(*)::int FROM public.memberships m WHERE m.idea_id=i.id) AS member_count
    FROM public.ideas i WHERE i.id=$1`,[ideaId]).then(r=>{if(!r.rows[0])throw notFound();return {commentCount:r.rows[0].comment_count,memberCount:r.rows[0].member_count,version:r.rows[0].version};});}
  async saveAttachment(a:StoredAttachment){
    const result=await this.pool.query(`INSERT INTO public.discussion_attachments(id,idea_id,owner_id,asset_id,name,mime,size,kind)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM public.memberships WHERE idea_id=$2 AND user_id=$3`,[a.id,a.ideaId,a.ownerId,a.assetId,a.name,a.mime,a.size,a.kind]);
    if(!result.rowCount)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để gửi tệp");
  }
  async getAttachment(ideaId:string,id:string,userId:string):Promise<StoredAttachment>{
    const r=await this.pool.query(`SELECT * FROM public.discussion_attachments WHERE idea_id=$1 AND id=$2 AND (comment_id IS NOT NULL OR owner_id=$3)`,[ideaId,id,userId]);
    const a=r.rows[0];if(!a)throw notFound();
    return {id:a.id,ideaId:a.idea_id,ownerId:a.owner_id,assetId:a.asset_id,name:a.name,mime:a.mime,size:a.size,kind:a.kind,commentId:a.comment_id,createdAt:a.created_at.toISOString(),url:`/api/ideas/${encodeURIComponent(ideaId)}/attachments/${encodeURIComponent(a.id)}`};
  }
  pinComment(ideaId:string,commentId:string,userId:string,pinned:boolean){return this.transaction(async db=>{
    if(!(await db.query("SELECT id FROM public.ideas WHERE id=$1 FOR UPDATE",[ideaId])).rowCount)throw notFound();
    if(!(await db.query("SELECT 1 FROM public.memberships WHERE idea_id=$1 AND user_id=$2",[ideaId,userId])).rowCount)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để ghim tin nhắn");
    const found=await db.query<{pinned_at:Date|null}>("SELECT pinned_at FROM public.comments WHERE idea_id=$1 AND id=$2",[ideaId,commentId]);if(!found.rows[0])throw notFound();
    if(!!found.rows[0].pinned_at===pinned)return;
    if(pinned&&(await db.query<{total:number}>("SELECT count(*)::int AS total FROM public.comments WHERE idea_id=$1 AND pinned_at IS NOT NULL",[ideaId])).rows[0].total>=50)throw new AppError(422,"PIN_LIMIT","Mỗi cuộc thảo luận ghim tối đa 50 tin nhắn");
    await db.query("UPDATE public.comments SET pinned_at=CASE WHEN $3 THEN now() ELSE NULL END WHERE idea_id=$1 AND id=$2",[ideaId,commentId,pinned]);
    await db.query("UPDATE public.ideas SET discussion_version=discussion_version+1 WHERE id=$1",[ideaId]);
  });}
  async unreadCounts(userId:string):Promise<UnreadCounts>{
    const result=await this.pool.query<{idea_id:string;unread_count:number}>(`SELECT m.idea_id,count(c.id)::int AS unread_count
      FROM public.memberships m LEFT JOIN public.comments c ON c.idea_id=m.idea_id
      AND c.read_sequence>m.last_read_sequence AND c.author_id<>m.user_id
      AND NOT EXISTS (SELECT 1 FROM public.comment_read_receipts r WHERE r.user_id=m.user_id AND r.comment_id=c.id)
      WHERE m.user_id=$1 GROUP BY m.idea_id`,[userId]);
    return Object.fromEntries(result.rows.map(r=>[r.idea_id,r.unread_count]));
  }
  async unreadCommentIds(ideaId:string,userId:string):Promise<string[]>{
    const result=await this.pool.query<{idea_exists:boolean;joined:boolean;id:string|null}>(`WITH viewer AS (
      SELECT EXISTS(SELECT 1 FROM public.ideas WHERE id=$1) AS idea_exists,
        EXISTS(SELECT 1 FROM public.memberships WHERE idea_id=$1 AND user_id=$2) AS joined
    ) SELECT viewer.*,c.id FROM viewer LEFT JOIN (
      SELECT c.id FROM public.comments c JOIN public.memberships m ON m.idea_id=c.idea_id AND m.user_id=$2
      WHERE c.idea_id=$1 AND c.author_id<>$2 AND c.read_sequence>m.last_read_sequence
        AND NOT EXISTS (SELECT 1 FROM public.comment_read_receipts r WHERE r.user_id=$2 AND r.comment_id=c.id)
    ) c ON true`,[ideaId,userId]);
    if(!result.rows[0].idea_exists)throw notFound();
    if(!result.rows[0].joined)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng để xem tin chưa đọc");
    return result.rows.flatMap(r=>r.id?[r.id]:[]);
  }
  markRead(ideaId:string,userId:string,commentIds:string|string[]){return this.transaction(async db=>{
    await requireIdea(db,ideaId);
    if(!(await db.query("SELECT 1 FROM public.memberships WHERE idea_id=$1 AND user_id=$2",[ideaId,userId])).rowCount)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng trước khi đánh dấu đã đọc");
    const ids=[...new Set(typeof commentIds==="string"?[commentIds]:commentIds)];
    const found=await db.query("SELECT id FROM public.comments WHERE idea_id=$1 AND id=ANY($2::text[])",[ideaId,ids]);
    if(found.rows.length!==ids.length)throw new AppError(400,"INVALID_COMMENT","Bình luận không thuộc ý tưởng này");
    await db.query(`INSERT INTO public.comment_read_receipts(idea_id,user_id,comment_id)
      SELECT $1,$2,c.id FROM public.comments c JOIN public.memberships m ON m.idea_id=c.idea_id AND m.user_id=$2
      WHERE c.idea_id=$1 AND c.id=ANY($3::text[]) AND c.author_id<>$2 AND c.read_sequence>m.last_read_sequence
      ON CONFLICT DO NOTHING`,[ideaId,userId,ids]);
    await db.query("UPDATE ideahub_private.notifications SET read_at=now() WHERE idea_id=$1 AND user_id=$2 AND comment_id=ANY($3::text[]) AND read_at IS NULL",[ideaId,userId,ids]);
  });}
  async createComment(ideaId: string, user: Author, input: CreateCommentInput): Promise<Comment> {
    return this.transaction(async db => {
      // Serialize room writes so sequence order also follows commit order.
      if(!(await db.query("SELECT id FROM public.ideas WHERE id=$1 FOR UPDATE",[ideaId])).rowCount)throw notFound();
      const members=(await db.query(`SELECT user_id FROM public.memberships WHERE idea_id=$1`,[ideaId])).rows.map(u=>({id:u.user_id,name:"",initial:""}));
      const mentions=checkMentions(input.text,input.mentions,members);
      const parentId = input.parentId ?? null;
      if (parentId) {
        const ancestors = await db.query<{ depth: number }>(`WITH RECURSIVE ancestors AS (
          SELECT id, parent_id, 1 AS depth FROM public.comments WHERE id = $1 AND idea_id = $2
          UNION ALL SELECT c.id, c.parent_id, a.depth + 1 FROM public.comments c
          JOIN ancestors a ON c.id = a.parent_id WHERE c.idea_id = $2 AND a.depth < 13
        ) SELECT depth FROM ancestors`, [parentId, ideaId]);
        if (!ancestors.rowCount) throw new AppError(400, "INVALID_PARENT", "Bình luận gốc không thuộc cuộc thảo luận này");
        if (ancestors.rows.some(a => a.depth > 12)) throw new AppError(422, "MAX_DEPTH", "Nhánh trả lời đã quá sâu, hãy trả lời một bình luận gần hơn");
      }
      const id = input.clientId ?? randomUUID();
      await ensureUser(db, user);
      const ids=input.attachmentIds??[];
      const receipts=ids.length?(await db.query(`SELECT id,name,mime,size,kind FROM public.discussion_attachments
        WHERE idea_id=$1 AND owner_id=$2 AND id=ANY($3::text[]) AND (comment_id IS NULL OR comment_id=$4) FOR UPDATE`,[ideaId,user.id,ids,id])).rows:[];
      if(receipts.length!==ids.length)throw new AppError(422,"INVALID_ATTACHMENT","Tệp không thuộc bạn hoặc đã được gửi");
      const attachments=ids.map(id=>{const a=receipts.find(a=>a.id===id)!;return {id:a.id,name:a.name,mime:a.mime,size:a.size,kind:a.kind,url:`/api/ideas/${encodeURIComponent(ideaId)}/attachments/${encodeURIComponent(a.id)}`};});
      const inserted=await db.query("INSERT INTO public.comments (id, idea_id, parent_id, author_id, body,attachments,mentions,search_text) VALUES ($1, $2, $3, $4, $5,$6::jsonb,$7::jsonb,$8) ON CONFLICT (id) DO NOTHING", [id, ideaId, parentId, user.id, input.text,JSON.stringify(attachments),JSON.stringify(mentions),normalize(input.text)]);
      const existing=(await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`,[id])).rows[0];
      if(!existing||existing.idea_id!==ideaId||existing.author_id!==user.id||existing.parent_id!==parentId||existing.body!==input.text||!sameMentions(existing.mentions,mentions)||JSON.stringify(existing.attachments.map(a=>a.id))!==JSON.stringify(ids))throw new AppError(409,"COMMENT_CONFLICT","Mã gửi bình luận đã được dùng");
      if(ids.length)await db.query("UPDATE public.discussion_attachments SET comment_id=$1 WHERE id=ANY($2::text[])",[id,ids]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ideaId, user.id]);
      const result = await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
      const saved=comment(result.rows[0]);const parent=parentId?(await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id=$1`,[parentId])).rows[0]:undefined;if(inserted.rowCount)await this.notify(db,saved,parent?comment(parent):undefined);return saved;
    });
  }
}
