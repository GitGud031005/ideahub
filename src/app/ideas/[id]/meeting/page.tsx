import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MeetingRoom } from "@/components/meeting-room";
import { meetingPilot } from "@/server/meetings/config";

export const metadata: Metadata = { title: "Phòng họp" };

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!meetingPilot(id)) notFound();
  return <MeetingRoom id={id} />;
}
