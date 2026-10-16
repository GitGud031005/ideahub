import type { Metadata } from "next";
import { Discussion } from "@/components/discussion";
export const metadata: Metadata = { title: "Thảo luận" };
export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <Discussion key={id} id={id}/>;
}
