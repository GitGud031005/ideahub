import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { Author, Category, Comment, CommentsPage, CreateCommentInput, CreateIdeaInput, Idea, IdeaQuery, IdeasPage } from "@/lib/domain";
import { normalize } from "@/lib/format";
import { AppError, notFound } from "./errors";
import type { IdeaRepository } from "./repository";

export interface DatabaseExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}
export interface DatabaseClient extends DatabaseExecutor { release(destroy?: boolean): void }
export interface DatabasePool extends DatabaseExecutor { connect(): Promise<DatabaseClient> }
type Executor = DatabaseExecutor;
interface IdeaRow {
  id: string; title: string; description: string; category: Category; tags: string[];
  creator_id: string; display_name: string; initial: string; created_at: Date;
  member_count: number; comment_count: number; joined: boolean; mine: boolean;
}
interface CommentRow {
  id: string; idea_id: string; parent_id: string | null; author_id: string;
  display_name: string; initial: string; body: string; created_at: Date;
}
const IDEA_SELECT = `SELECT i.id, i.title, i.description, i.category, i.tags, i.creator_id,
  u.display_name, u.initial, i.created_at,
  (SELECT count(*)::int FROM public.memberships m WHERE m.idea_id = i.id) AS member_count,
  (SELECT count(*)::int FROM public.comments c WHERE c.idea_id = i.id) AS comment_count,
  EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $1) AS joined,
  i.creator_id = $1 AS mine
  FROM public.ideas i JOIN public.users u ON u.id = i.creator_id`;
const COMMENT_SELECT = `SELECT c.id, c.idea_id, c.parent_id, c.author_id, c.body, c.created_at,
  u.display_name, u.initial FROM public.comments c JOIN public.users u ON u.id = c.author_id`;
function idea(row: IdeaRow): Idea {
  return { id: row.id, title: row.title, description: row.description, category: row.category, tags: row.tags,
    creator: { id: row.creator_id, name: row.display_name, initial: row.initial }, createdAt: row.created_at.toISOString(),
    memberCount: row.member_count, commentCount: row.comment_count, joined: row.joined, mine: row.mine };
}
function comment(row: CommentRow): Comment {
  return { id: row.id, ideaId: row.idea_id, parentId: row.parent_id, text: row.body,
    author: { id: row.author_id, name: row.display_name, initial: row.initial }, createdAt: row.created_at.toISOString() };
}
async function upsertUser(db: Executor, user: Author) {
  await db.query(`INSERT INTO public.users (id, display_name, initial) VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, initial = EXCLUDED.initial`, [user.id, user.name, user.initial]);
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
    return this.transaction(async db => {
      // Counts describe the full dashboard, independently of the current search/filter.
      const counts = (await db.query<{ all: number; joined: number; mine: number }>(`SELECT count(*)::int AS all,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $1))::int AS joined,
        count(*) FILTER (WHERE i.creator_id = $1)::int AS mine FROM public.ideas i`, [userId])).rows[0];
      const where = `WHERE strpos(i.search_text, $2) > 0
        AND ($3 = 'all' OR ($3 = 'mine' AND i.creator_id = $1)
          OR ($3 = 'joined' AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.idea_id = i.id AND m.user_id = $1)))`;
      const values = [userId, normalize(query.q), query.view];
      const total = (await db.query<{ total: number }>(`SELECT count(*)::int AS total FROM public.ideas i ${where}`, values)).rows[0].total;
      const order = query.sort === "popular" ? "member_count DESC, " : "";
      const result = await db.query<IdeaRow>(`${IDEA_SELECT} ${where} ORDER BY ${order}i.created_at DESC, i.id COLLATE "C" ASC LIMIT $4 OFFSET $5`, [...values, query.limit, query.offset]);
      return { items: result.rows.map(idea), total, counts };
    }, true);
  }
  getIdea(id: string, userId: string) { return getIdea(this.pool, id, userId); }
  async createIdea(user: Author, input: CreateIdeaInput): Promise<Idea> {
    return this.transaction(async db => {
      const id = randomUUID(), tags = [...new Set([input.category, ...input.tags])].slice(0, 12);
      await upsertUser(db, user);
      await db.query(`INSERT INTO public.ideas (id, title, description, category, tags, search_text, creator_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, input.title, input.description, input.category, tags, normalize([input.title, input.description, ...tags].join(" ")), user.id]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id) VALUES ($1, $2)", [id, user.id]);
      return getIdea(db, id, user.id);
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
    return this.transaction(async db => {
      if (!(await db.query("SELECT id FROM public.ideas WHERE id = $1", [ideaId])).rowCount) throw notFound();
      if (cursor && !(await db.query("SELECT id FROM public.comments WHERE idea_id = $1 AND id = $2", [ideaId, cursor])).rowCount) {
        throw new AppError(400, "INVALID_CURSOR", "Vị trí bình luận không hợp lệ");
      }
      const total = (await db.query<{ total: number }>("SELECT count(*)::int AS total FROM public.comments WHERE idea_id = $1", [ideaId])).rows[0].total;
      const result = await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.idea_id = $1
        AND ($2::text IS NULL OR (c.created_at, c.id COLLATE "C") >
          (SELECT created_at, id COLLATE "C" FROM public.comments WHERE idea_id = $1 AND id = $2))
        ORDER BY c.created_at, c.id COLLATE "C" LIMIT $3`, [ideaId, cursor ?? null, limit + 1]);
      const items = result.rows.slice(0, limit).map(comment);
      return { items, total, nextCursor: result.rows.length > limit ? items.at(-1)?.id ?? null : null };
    }, true);
  }
  async createComment(ideaId: string, user: Author, input: CreateCommentInput): Promise<Comment> {
    return this.transaction(async db => {
      await requireIdea(db, ideaId);
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
      const id = randomUUID();
      await upsertUser(db, user);
      await db.query("INSERT INTO public.comments (id, idea_id, parent_id, author_id, body) VALUES ($1, $2, $3, $4, $5)", [id, ideaId, parentId, user.id, input.text]);
      await db.query("INSERT INTO public.memberships (idea_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ideaId, user.id]);
      const result = await db.query<CommentRow>(`${COMMENT_SELECT} WHERE c.id = $1`, [id]);
      return comment(result.rows[0]);
    });
  }
}
