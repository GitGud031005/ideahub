"use client";

import { useQuery } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { api } from "@/lib/api-client";
import { MEETING_CAPACITY, meetingApi, type MeetingStatus } from "@/lib/meeting";
import styles from "./discussion-header.module.css";

export function MeetingLink({ id, userId }: { id: string; userId: string }) {
  const status = useQuery({
    queryKey: ["meeting", id, userId],
    queryFn: ({ signal }) => api<MeetingStatus>(meetingApi(id), { signal }),
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
  });
  const { session, canStart } = status.data ?? {};
  if (!canStart && (!session || session.phase === "closed")) return null;
  const label = session?.phase === "active" ? `Vào họp · ${session.participants}/${MEETING_CAPACITY}`
    : session?.phase === "creating" ? "Đang mở phòng" : session?.phase === "closing" ? "Phòng đang đóng" : "Bắt đầu họp";
  // The browser applies Permissions-Policy to a document, so load the
  // meeting URL as a new document even when coming from the discussion.
  return <a className={styles.meeting} href={`/ideas/${encodeURIComponent(id)}/meeting`} aria-label={label} title={label}>
    <Video size={17} aria-hidden="true" /><span>{label}</span>
  </a>;
}
