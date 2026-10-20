import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Author, Category, Comment, CommentsPage, CreateCommentInput, CreateIdeaInput, Idea, IdeaQuery, IdeasPage, IdeaStatus, IdeaStatusFilter, UnreadCounts } from "@/lib/domain";
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
  member_count: number; comment_count: number; joined: boolean; mine: boolean;
  cursor_time: string; rank_members?: number;
}
interface CommentRow {
  id: string; idea_id: string; parent_id: string | null; author_id: string;
  display_name: string; initial: string; avatar_url: string | null; body: string; created_at: Date; read_sequence:string;
  attachments:Attachment[]; pinned_at:Date|null;
}
const IDEA_SELECT = `SELECT i.id, i.status, i.title, i.description, i.category, i.tags, i.creator_id,
  u.display_name, u.initial, u.avatar_url, i.created_at,
  to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
  (SELECT count(*)::int FROM public.memberships m WHERE m.idea_id = i.id) AS member_count,
  (SELECT count(*)::int FROM public.comments c WHERE c.idea_id = i.id) AS comment_count,
  EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $1) AS joined,
  i.creator_id = $1 AS mine
  FROM public.ideas i JOIN public.users u ON u.id = i.creator_id`;
const COMMENT_SELECT = `SELECT c.id, c.idea_id, c.parent_id, c.author_id, c.body, c.created_at, c.read_sequence::text,c.attachments,c.pinned_at,
  u.display_name, u.initial, u.avatar_url FROM public.comments c JOIN public.users u ON u.id = c.author_id`;
function idea(row: IdeaRow): Idea {
  return { id: row.id, status: row.status, title: row.title, description: row.description, category: row.category, tags: row.tags,
    creator: { id: row.creator_id, name: row.display_name, initial: row.initial, avatarUrl: row.avatar_url }, createdAt: row.created_at.toISOString(),
    memberCount: row.member_count, commentCount: row.comment_count, joined: row.joined, mine: row.mine };
}
function comment(row: CommentRow): Comment {
  return { id: row.id, ideaId: row.idea_id, parentId: row.parent_id, text: row.body,
    author: { id: row.author_id, name: row.display_name, initial: row.initial, avatarUrl: row.avatar_url }, createdAt: row.created_at.toISOString(),readCursor:row.read_sequence,
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
  async listIdeas(userId: string, query: IdeaQuery): Promise<IdeasPage> {
    const cursor = readIdeaCursor(userId, query);
    return this.transaction(async db => {
      const snapshot = cursor?.snapshot ?? (await db.query<{ snapshot: string }>(`SELECT
        to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS snapshot`)).rows[0].snapshot;
      const status = query.status ?? "active";
      const statusWhere = `($5 = 'all' OR ($5 = 'active' AND i.status <> 'archived') OR i.status = $5)`;
      // View counts follow classification; status counts follow the selected view/search.
      const counts = (await db.query<{ all: number; joined: number; mine: number }>(`SELECT count(*)::int AS all,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $1))::int AS joined,
        count(*) FILTER (WHERE i.creator_id = $1)::int AS mine FROM public.ideas i
        WHERE ($2 = 'all' OR ($2 = 'active' AND i.status <> 'archived') OR i.status = $2)`, [userId, status])).rows[0];
      const viewWhere = `($3 = 'all' OR ($3 = 'mine' AND i.creator_id = $1)
          OR ($3 = 'joined' AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $1 AND m.joined_at <= $4::timestamptz)))`;
      const baseWhere = `WHERE strpos(i.search_text, $2) > 0 AND i.created_at <= $4::timestamptz AND ${viewWhere}`;
      const where = `${baseWhere} AND ${statusWhere}`;
      const values = [userId, normalize(query.q), query.view, snapshot, status];
      const statusCounts = (await db.query<Record<IdeaStatusFilter, number>>(`SELECT count(*)::int AS all,
        count(*) FILTER (WHERE i.status <> 'archived')::int AS active,
        count(*) FILTER (WHERE i.status = 'new')::int AS new,
        count(*) FILTER (WHERE i.status = 'potential')::int AS potential,
        count(*) FILTER (WHERE i.status = 'archived')::int AS archived FROM public.ideas i ${baseWhere}`, values.slice(0,4))).rows[0];
      const total = statusCounts[status];
      // Freeze popularity at the first page; new joins must not move unseen rows across the cursor.
      const rank = query.sort === "popular" ? `(SELECT count(*)::int FROM public.memberships m
        WHERE m.idea_id = i.id AND m.joined_at <= $4::timestamptz)` : "0";
      const result = await db.query<IdeaRow>(`WITH ranked AS (
        ${IDEA_SELECT.replace("SELECT i.id", `SELECT ${rank} AS rank_members, i.id`)} ${where}
      ) SELECT * FROM ranked WHERE $6::text IS NULL OR rank_members < $7::int
        OR (rank_members = $7::int AND (created_at < $8::timestamptz
          OR (created_at = $8::timestamptz AND id COLLATE "C" > $6)))
        ORDER BY rank_members DESC, created_at DESC, id COLLATE "C" ASC LIMIT $9 OFFSET $10`,
      [...values, cursor?.id ?? null, cursor?.members ?? 0, cursor?.createdAt ?? null, query.limit + 1, cursor ? 0 : query.offset]);
      const rows = result.rows.slice(0, query.limit), last = rows.at(-1);
      return { items: rows.map(idea), total, counts, statusCounts, nextCursor: result.rows.length > query.limit && last
        ? writeIdeaCursor(userId, query, { snapshot, id: last.id, createdAt: last.cursor_time, members: last.rank_members! }) : null };
    }, true);
  }
  getIdea(id: string, userId: string) { return getIdea(this.pool, id, userId); }
  async createIdea(user: Author, input: CreateIdeaInput): Promise<Idea> {
    return this.transaction(async db => {
      const id = randomUUID(), tags = [...new Set([input.category, ...input.tags])].slice(0, 12);
      await ensureUser(db, user);
      await db.query(`INSERT INTO public.ideas (id, title, description, category, tags, search_text, creator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, input.title, input.description, input.category, tags, normalize([input.title, input.description, ...tags].join(" ")), user.id]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id) VALUES ($1, $2)", [id, user.id]);
      return getIdea(db, id, user.id);
    });
  }
  async setIdeaStatus(id: string, userId: string, status: IdeaStatus): Promise<Idea> {
    return this.transaction(async db => {
      await requireIdea(db, id);
      const result = await db.query(`UPDATE public.ideas i SET status = $3 WHERE i.id = $1
        AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $2) RETURNING i.id`, [id, userId, status]);
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
      await db.query("INSERT INTO public.memberships (idea_id, user_id, last_read_sequence) VALUES ($1, $2, COALESCE((SELECT max(read_sequence) FROM public.comments WHERE idea_id=$1),0)) ON CONFLICT DO NOTHING", [id, userId]);
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
      WHERE m.user_id=$1 GROUP BY m.idea_id`,[userId]);
    return Object.fromEntries(result.rows.map(r=>[r.idea_id,r.unread_count]));
  }
  markRead(ideaId:string,userId:string,commentId:string){return this.transaction(async db=>{
    await requireIdea(db,ideaId);
    if(!(await db.query("SELECT 1 FROM public.memberships WHERE idea_id=$1 AND user_id=$2",[ideaId,userId])).rowCount)throw new AppError(403,"NOT_JOINED","Tham gia ý tưởng trước khi đánh dấu đã đọc");
    const found=await db.query<{read_sequence:string}>("SELECT read_sequence::text FROM public.comments WHERE idea_id=$1 AND id=$2",[ideaId,commentId]);
    if(!found.rows[0])throw new AppError(400,"INVALID_COMMENT","Bình luận không thuộc ý tưởng này");
    await db.query("UPDATE public.memberships SET last_read_sequence=GREATEST(last_read_sequence,$3::bigint) WHERE idea_id=$1 AND user_id=$2",[ideaId,userId,found.rows[0].read_sequence]);
  });}
  async createComment(ideaId: string, user: Author, input: CreateCommentInput): Promise<Comment> {
    return this.transaction(async db => {
      // Serialize room writes so sequence order also follows commit order.
      if(!(await db.query("SELECT id FROM public.ideas WHERE id=$1 FOR UPDATE",[ideaId])).rowCount)throw notFound();
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
      await db.query("INSERT INTO public.comments (id, idea_id, parent_id, author_id, body,attachments) VALUES ($1, $2, $3, $4, $5,$6::jsonb) ON CONFLICT (id) DO NOTHING", [id, ideaId, parentId, user.id, input.text,JSON.stringify(attachments)]);
      const existing=(await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`,[id])).rows[0];
      if(!existing||existing.idea_id!==ideaId||existing.author_id!==user.id||existing.parent_id!==parentId||existing.body!==input.text||JSON.stringify(existing.attachments.map(a=>a.id))!==JSON.stringify(ids))throw new AppError(409,"COMMENT_CONFLICT","Mã gửi bình luận đã được dùng");
      if(ids.length)await db.query("UPDATE public.discussion_attachments SET comment_id=$1 WHERE id=ANY($2::text[])",[id,ids]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id, last_read_sequence) VALUES ($1, $2, COALESCE((SELECT max(read_sequence) FROM public.comments WHERE idea_id=$1),0)) ON CONFLICT DO NOTHING", [ideaId, user.id]);
      const result = await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
      return comment(result.rows[0]);
    });
  }
}
