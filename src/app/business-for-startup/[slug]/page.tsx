import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StartupLessonView } from "@/components/business-for-startup/lesson";
import { getStartupLesson, lessonCatalog } from "@/content/business-for-startup";
export const dynamicParams = false;
export function generateStaticParams() { return lessonCatalog.map(l => ({ slug: l.slug })); }
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lesson = getStartupLesson((await params).slug);
  if (!lesson) notFound();
  return { title: `${lesson.chapter === null ? "Tổng kết" : `Chương ${lesson.chapter}`} · ${lesson.title}`, description: lesson.description };
}
export default async function LessonPage({ params }: Props) {
  const lesson = getStartupLesson((await params).slug);
  if (!lesson) notFound();
  return <StartupLessonView lesson={lesson} catalog={lessonCatalog}/>;
}
