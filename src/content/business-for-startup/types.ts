export type FigureName = "journey" | "opportunity" | "feasibility" | "business-model" | "canvas" | "market" | "plan" | "finance" | "team" | "funding" | "marketing" | "ip" | "prototype" | "workflow";
export type ContentBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "table"; columns: string[]; rows: string[][]; caption?: string }
  | { kind: "callout"; label: string; text: string }
  | { kind: "template"; title: string; text: string }
  | { kind: "figure"; name: FigureName; caption: string };
export type LessonSection = { id: string; title: string; blocks: ContentBlock[] };
export type StartupLesson = {
  slug: string; chapter: number | null; group: number; title: string; description: string;
  question: string; outcome: string; sections: LessonSection[];
  takeaways: string[]; practice: string[]; proposal: string; sources: string[];
};
export type LessonMeta = Pick<StartupLesson, "slug" | "chapter" | "group" | "title" | "description" | "outcome"> & { minutes: number };
export type SearchEntry = { href: string; lesson: string; title: string; text: string };
export const p = (text: string): ContentBlock => ({ kind: "paragraph", text });
export const list = (...items: string[]): ContentBlock => ({ kind: "list", items });
export const ordered = (...items: string[]): ContentBlock => ({ kind: "list", items, ordered: true });
export const table = (columns: string[], rows: string[][], caption?: string): ContentBlock => ({ kind: "table", columns, rows, caption });
export const note = (label: string, text: string): ContentBlock => ({ kind: "callout", label, text });
export const template = (title: string, text: string): ContentBlock => ({ kind: "template", title, text });
export const figure = (name: FigureName, caption: string): ContentBlock => ({ kind: "figure", name, caption });
export const section = (id: string, title: string, ...blocks: ContentBlock[]): LessonSection => ({ id, title, blocks });
export function blockText(block: ContentBlock): string {
  switch (block.kind) {
    case "paragraph": return block.text;
    case "list": return block.items.join(" ");
    case "table": return [block.caption ?? "", ...block.columns, ...block.rows.flat()].join(" ");
    case "callout": return `${block.label} ${block.text}`;
    case "template": return `${block.title} ${block.text}`;
    case "figure": return block.caption;
  }
}
