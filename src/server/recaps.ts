import { createHash, timingSafeEqual } from "node:crypto";
import type { RecapKind } from "@/lib/recaps";
import { localDay, periodFor, validDay } from "@/lib/recaps";
import { AppError } from "./errors";
import { GeminiRecapGenerator, type RecapGenerator } from "./gemini-recap";
import { RecapStore } from "./recap-store";
import { getDatabasePool } from "./database";
import { getRepository } from "./container";
import type { IdeaRepository } from "./repository";
import { getAuthService } from "./auth";

export class RecapService {
  constructor(private store: RecapStore, private repo: IdeaRepository, private generator: RecapGenerator,
    private consumeBudget: () => Promise<void> = () => getAuthService().limit("recap:global", 100, 86400)) {}
  async list(ideaId: string, viewerId: string, offset: number) {
    await this.repo.getIdea(ideaId, viewerId);
    return { ...await this.store.list(ideaId, offset), aiConfigured: this.generator.configured() };
  }
  async get(ideaId: string, id: string, viewerId: string) { await this.repo.getIdea(ideaId, viewerId); return this.store.get(ideaId, id); }
  async generate(ideaId: string, input: { kind: RecapKind; date: string }, viewerId: string | null, now = new Date()) {
    if (!validDay(input.date) || input.date > localDay(now) || input.date < "2020-01-01") throw new AppError(422, "RECAP_DATE", "Chọn một ngày từ năm 2020 đến hôm nay");
    const idea = await this.repo.getIdea(ideaId, viewerId ?? "__cron__");
    if (viewerId && !idea.joined) throw new AppError(403, "RECAP_MEMBERSHIP", "Tham gia thảo luận trước khi tạo recap");
    if (!this.generator.configured()) throw new AppError(503, "AI_NOT_CONFIGURED", "AI recap chưa được kết nối. Bạn vẫn có thể xem các bản đã lưu");
    const { start, end } = periodFor(input.kind, input.date);
    const source = await this.store.source(ideaId, input.kind, start, end, idea.title, idea.description);
    const hash = createHash("sha256").update("recap-v1:" + JSON.stringify(source)).digest("hex");
    const claimed = await this.store.claim(ideaId, input.kind, start, end, hash, source.messages.filter(m => !m.contextOnly).length);
    if (claimed.cached) return claimed.cached;
    try {
      const result = await this.generator.generate(source);
      await this.store.complete(claimed.id, claimed.lease!, result.content, result.model, source.messages.filter(m => !m.contextOnly).length);
      return await this.store.get(ideaId, claimed.id);
    } catch (error) { await this.store.fail(claimed.id, claimed.lease!); throw error; }
  }
  async runDaily(now = new Date()) {
    if (!this.generator.configured()) return { skipped: "AI_NOT_CONFIGURED", completed: 0, failed: 0, hasMore: false };
    const candidates = await this.store.pending(localDay(now), 5);
    let completed = 0, failed = 0;
    for (const c of candidates.slice(0, 4)) {
      try {
        await this.consumeBudget();
        await this.generate(c.ideaId, { kind: c.kind, date: c.date }, null, now); completed++;
      } catch (error) {
        failed++;
        // Only log safe codes, never chat text or the raw provider error.
        console.error("IdeaHub recap job failed", error instanceof AppError ? error.code : "INTERNAL");
      }
    }
    return { completed, failed, hasMore: candidates.length > 4 };
  }
}
export function cronAuthorized(request: Request, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16) return false;
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(request.headers.get("authorization") || ""), hash(`Bearer ${secret}`));
}
export function getRecapService() {
  if (process.env.IDEAHUB_STORAGE !== "postgres") throw new AppError(503, "RECAP_STORAGE", "Recap cần kết nối PostgreSQL");
  return new RecapService(new RecapStore(getDatabasePool()), getRepository(), new GeminiRecapGenerator());
}
