import type { Comment } from "./domain";
import { buildCommentForest } from "./format";

/** Rendered levels only: a collapsed child never acknowledges its descendants. */
export function visibleCommentIds(comments: Comment[], expanded: ReadonlySet<string>): string[] {
  const tree = buildCommentForest(comments, "old"), visible: string[] = [], seen = new Set<string>();
  function visit(parent: string | null) {
    for (const comment of tree.get(parent) ?? []) {
      if (seen.has(comment.id)) continue;
      seen.add(comment.id); visible.push(comment.id);
      if (expanded.has(comment.id)) visit(comment.id);
    }
  }
  visit(null); return visible;
}

/** Each count excludes the parent itself and includes every depth below it. */
export function branchCommentCounts<T extends { id: string }>(children: Map<string | null, T[]>, unread: ReadonlySet<string>) {
  const counts = new Map<string, { total: number; unread: number }>(), visiting = new Set<string>();
  function visit(id: string): { total: number; unread: number } {
    if (counts.has(id)) return counts.get(id)!;
    if (visiting.has(id)) return { total: 0, unread: 0 };
    visiting.add(id);
    const result = { total: 0, unread: 0 };
    for (const child of children.get(id) ?? []) {
      const nested = visit(child.id);
      result.total += 1 + nested.total;
      result.unread += Number(unread.has(child.id)) + nested.unread;
    }
    visiting.delete(id); counts.set(id, result); return result;
  }
  for (const comments of children.values()) for (const comment of comments) visit(comment.id);
  return counts;
}
