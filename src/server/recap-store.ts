import { randomUUID } from "node:crypto";
import type { Recap, RecapContent, RecapFile, RecapKind } from "@/lib/recaps";
import { recapFileName } from "@/lib/recaps";
import type { DatabasePool } from "./postgres-repository";
import type { RecapMessage, RecapSource } from "./gemini-recap";
import { AppError } from "./errors";

interface RecapRow {
  id: string; idea_id: string; kind: RecapKind; period_start: string; period_end: string;
  source: "sample" | "gemini"; source_count: number; created_at: Date; updated_at: Date;
  content: RecapContent | null; status: string; source_hash: string | null;model:string|null;
}
const columns = "id, idea_id, kind, period_start::text, period_end::text, source, source_count, created_at, updated_at, content, status, source_hash, model";
function file(row: RecapRow): RecapFile {
  return { id: row.id, ideaId: row.idea_id, kind: row.kind, periodStart: row.period_start, periodEnd: row.period_end,
    source: row.source, sourceCount: row.source_count, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), model:row.model,fileName: recapFileName(row.kind, row.period_start) };
}
export interface RecapCandidate { ideaId: string; kind: RecapKind; date: string }
export class RecapStore {
  constructor(private pool: DatabasePool) {}
  async list(ideaId: string, offset: number, limit = 50) {
    const result = await this.pool.query<RecapRow>(`SELECT ${columns} FROM ideahub_private.recaps WHERE idea_id=$1 AND status='ready'
      ORDER BY period_start DESC, kind DESC, id LIMIT $2 OFFSET $3`, [ideaId, limit + 1, offset]);
    return { items: result.rows.slice(0, limit).map(file), nextOffset: result.rows.length > limit ? offset + limit : null };
  }
  async get(ideaId: string, id: string): Promise<Recap> {
    const row = (await this.pool.query<RecapRow>(`SELECT ${columns} FROM ideahub_private.recaps WHERE idea_id=$1 AND id=$2 AND status='ready'`, [ideaId, id])).rows[0];
    if (!row?.content) throw new AppError(404, "RECAP_NOT_FOUND", "Không tìm thấy bản recap này");
    return { ...file(row), content: row.content };
  }
  async source(ideaId: string, kind: RecapKind, start: string, end: string, title: string, description: string): Promise<RecapSource> {
    const result = await this.pool.query<{ id: string; parent_id: string | null; display_name: string; body: string; created_at: Date; context_only: boolean }>(`WITH RECURSIVE selected AS (
      SELECT id, parent_id FROM public.comments WHERE idea_id=$1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
      ORDER BY created_at, id COLLATE "C" LIMIT 501
    ), chain AS (
      SELECT id, parent_id FROM selected
      UNION SELECT c.id, c.parent_id FROM public.comments c JOIN chain a ON c.id=a.parent_id WHERE c.idea_id=$1
    ) SELECT c.id,c.parent_id,c.body,c.created_at,u.display_name, NOT EXISTS(SELECT 1 FROM selected s WHERE s.id=c.id) AS context_only
      FROM chain a JOIN public.comments c ON c.id=a.id JOIN public.users u ON u.id=c.author_id ORDER BY c.created_at,c.id COLLATE "C"`, [ideaId, `${start}T00:00:00+07:00`, `${end}T00:00:00+07:00`]);
    const messages: RecapMessage[] = result.rows.map(r => ({ id: r.id, parentId: r.parent_id, author: r.display_name, text: r.body, createdAt: r.created_at.toISOString(), contextOnly: r.context_only }));
    const count = messages.filter(m => !m.contextOnly).length;
    if (!count) throw new AppError(422, "RECAP_EMPTY", "Khoảng thời gian này chưa có bình luận để tổng hợp");
    const source = { title, description, kind, start, end, messages };
    if (count > 500 || Buffer.byteLength(JSON.stringify(source), "utf8") > 160000) throw new AppError(422, "RECAP_TOO_LARGE", "Cuộc thảo luận trong kỳ này quá dài để tổng hợp trong một lượt");
    return source;
  }
  async claim(ideaId: string, kind: RecapKind, start: string, end: string, hash: string, count: number, now = new Date()) {
    const lease = randomUUID(), id = randomUUID();
    const result = await this.pool.query<RecapRow>(`INSERT INTO ideahub_private.recaps (id,idea_id,kind,period_start,period_end,status,source,source_hash,source_count,lease_token,lease_until,updated_at)
      VALUES ($1,$2,$3,$4::date,$5::date,'generating','gemini',$6,$7,$8,$9,$10)
      ON CONFLICT (idea_id,kind,period_start) DO UPDATE SET status='generating',source_hash=EXCLUDED.source_hash,
        lease_token=EXCLUDED.lease_token,lease_until=EXCLUDED.lease_until,updated_at=EXCLUDED.updated_at
      WHERE (recaps.status <> 'generating' OR recaps.lease_until <= $10)
        AND (recaps.status <> 'ready' OR recaps.source='sample' OR recaps.source_hash IS DISTINCT FROM $6)
      RETURNING ${columns}`, [id, ideaId, kind, start, end, hash, count, lease, new Date(now.getTime() + 120000), now]);
    if (result.rows[0]) return { id: result.rows[0].id, lease, cached: null };
    const row = (await this.pool.query<RecapRow>(`SELECT ${columns} FROM ideahub_private.recaps WHERE idea_id=$1 AND kind=$2 AND period_start=$3::date`, [ideaId, kind, start])).rows[0];
    if (row?.status === "ready" && row.source === "gemini" && row.source_hash === hash && row.content) return { id: row.id, lease: null, cached: { ...file(row), content: row.content } as Recap };
    throw new AppError(409, "RECAP_BUSY", "Bản recap này đang được tạo, bạn chờ một chút rồi mở lại nhé");
  }
  async complete(id: string, lease: string, content: RecapContent, model: string, count: number) {
    const result = await this.pool.query(`UPDATE ideahub_private.recaps SET status='ready',source='gemini',content=$3::jsonb,model=$4,
      source_count=$5,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='generating' RETURNING id`, [id, lease, JSON.stringify(content), model, count]);
    if (!result.rowCount) throw new AppError(409, "RECAP_BUSY", "Lượt tạo recap đã hết hạn, hãy thử lại");
  }
  async fail(id: string, lease: string) {
    await this.pool.query(`UPDATE ideahub_private.recaps SET status=CASE WHEN content IS NULL THEN 'failed' ELSE 'ready' END,
      source_hash=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='generating'`, [id, lease]);
  }
  async pending(today: string, limit = 5): Promise<RecapCandidate[]> {
    // Closed periods only, bounded catch-up: 14 days and eight full weeks.
    const result = await this.pool.query<{ idea_id: string; kind: RecapKind; period_start: string }>(`WITH daily AS (
      SELECT idea_id,'daily'::text AS kind,(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS start,count(*)::int AS total
      FROM public.comments WHERE created_at >= ($1::date-14)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
        AND created_at < $1::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh' GROUP BY idea_id,start
    ), weekly AS (
      SELECT idea_id,'weekly'::text AS kind,date_trunc('week',created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS start,count(*)::int AS total
      FROM public.comments WHERE created_at >= (date_trunc('week',$1::date::timestamp)-interval '8 weeks') AT TIME ZONE 'Asia/Ho_Chi_Minh'
        AND created_at < date_trunc('week',$1::date::timestamp) AT TIME ZONE 'Asia/Ho_Chi_Minh' GROUP BY idea_id,start
    ) SELECT p.idea_id,p.kind,p.start::text AS period_start FROM (SELECT * FROM daily UNION ALL SELECT * FROM weekly) p
      LEFT JOIN ideahub_private.recaps r ON r.idea_id=p.idea_id AND r.kind=p.kind AND r.period_start=p.start
      WHERE p.total <= 500 AND (r.id IS NULL OR (r.status <> 'generating' OR r.lease_until <= now())
        AND (r.status <> 'ready' OR r.source='sample' OR r.source_count <> p.total OR r.source_hash IS NULL))
      ORDER BY r.updated_at ASC NULLS FIRST,p.start DESC,p.kind DESC,p.idea_id LIMIT $2`, [today, limit]);
    return result.rows.map(r => ({ ideaId: r.idea_id, kind: r.kind, date: r.period_start }));
  }
}
