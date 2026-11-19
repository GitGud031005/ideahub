import type { Metadata } from "next";
import { Discussion } from "@/components/discussion";
import { meetingPilot } from "@/server/meetings/config";
export const metadata: Metadata = { title: "Thảo luận" };
export default async function IdeaPage({ params,searchParams }: { params: Promise<{ id: string }>;searchParams:Promise<{comment?:string}> }) {
  const { id } = await params; const query=await searchParams;return <Discussion key={id} id={id} meetingEnabled={meetingPilot(id)} requestedComment={typeof query.comment==="string"?query.comment:undefined}/>;
}
