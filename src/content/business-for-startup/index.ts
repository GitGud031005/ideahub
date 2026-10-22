import { foundations } from "./foundations";
import { resources } from "./resources";
import { proposalLesson } from "./proposal";
import { blockText, type LessonMeta, type SearchEntry } from "./types";
export const startupBase = "/business-for-startup";
export const lessonGroups = ["Ý tưởng và kiểm chứng", "Mô hình và kế hoạch", "Nguồn lực và thị trường", "Tổng kết thực hành"];
export const startupLessons = [...foundations, ...resources, proposalLesson];
export const lessonCatalog: LessonMeta[] = startupLessons.map(lesson => {
  const words = lesson.sections.flatMap(s => s.blocks.map(blockText)).join(" ").split(/\s+/).length;
  return { slug: lesson.slug, chapter: lesson.chapter, group: lesson.group, title: lesson.title, description: lesson.description, outcome: lesson.outcome, minutes: Math.max(4, Math.ceil(words / 220)) };
});
export const searchEntries: SearchEntry[] = startupLessons.flatMap(lesson => lesson.sections.map(s => ({ href: `${startupBase}/${lesson.slug}#${s.id}`, lesson: lesson.chapter ? `Chương ${lesson.chapter} · ${lesson.title}` : lesson.title, title: s.title, text: s.blocks.map(blockText).join(" ") })));
export function getStartupLesson(slug: string) { return startupLessons.find(lesson => lesson.slug === slug); }
