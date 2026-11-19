"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Mic, Video } from "lucide-react";
import { ApiError, api } from "@/lib/api-client";
import { MEETING_CAPACITY, meetingApi, type MeetingEndReason, type MeetingJoin, type MeetingStatus } from "@/lib/meeting";
import { useAuth } from "./providers";
import { PreviewVideo, useMeetingPreview } from "./meeting-preview";
import styles from "./meeting-room.module.css";

const MeetingCall = dynamic(() => import("./meeting-call").then(module => module.MeetingCall), {
  ssr: false, loading: () => <p role="status">Đang kết nối…</p>,
});

function endMessage(reason: MeetingEndReason | null | undefined) {
  switch (reason) {
    case "expired": return "Phiên họp đã hết thời gian.";
    case "deleted": return "Block đã bị xóa.";
    case "setup_failed": return "Không mở được phòng. Bạn có thể thử bắt đầu lại.";
    default: return "Phòng đã tự đóng sau khi không còn người tham gia.";
  }
}

export function MeetingRoom({ id }: { id: string }) {
  const { user, ready, requestLogin } = useAuth();
  return <main className={styles.page}>
    {!ready ? <p role="status">Đang tải phòng họp…</p> : user
      ? <MemberRoom key={user.id} id={id} userId={user.id} />
      : <section className={styles.card}>
        <h1>Phòng họp</h1>
        <p>Đăng nhập bằng tài khoản IdeaHub để vào phòng.</p>
        <button className={styles.primary} onClick={() => requestLogin()}>Đăng nhập</button>
        <Back id={id} />
      </section>}
  </main>;
}

function Back({ id }: { id: string }) {
  return <a className={styles.back} href={`/ideas/${encodeURIComponent(id)}`}>
    <ArrowLeft size={17} aria-hidden="true" /> Quay lại thảo luận
  </a>;
}

function MemberRoom({ id, userId }: { id: string; userId: string }) {
  const path = meetingApi(id);
  const status = useQuery({
    queryKey: ["meeting", id, userId],
    queryFn: ({ signal }) => api<MeetingStatus>(path, { signal }),
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const refresh = status.refetch;
  const preview = useMeetingPreview();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<{ credentials: MeetingJoin; mic: boolean; camera: boolean; received: number } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const row = status.data?.session;
  const stopPreview = preview.stop;
  useEffect(() => {
    if (row?.phase !== "active") stopPreview();
  }, [row?.phase, stopPreview]);

  const onExit = useCallback((message: string, expiredId?: string) => {
    setConnection(null);
    setMessage(message);
    if (expiredId) setDismissed(expiredId);
    void refresh();
  }, [refresh]);

  async function start() {
    if (pending || !status.data?.canStart) return;
    setPending(true);
    setMessage("");
    try {
      await api<MeetingStatus>(path, { method: "POST", body: JSON.stringify({ action: "start", afterId: row?.id ?? null }) });
      await refresh();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : "Không mở được phòng. Vui lòng thử lại.");
      void refresh();
    } finally { setPending(false); }
  }

  async function join(mic: boolean, camera: boolean) {
    if (pending || row?.phase !== "active") return;
    setPending(true);
    setMessage("");
    preview.stop();
    try {
      const credentials = await api<MeetingJoin>(path, { method: "POST", body: JSON.stringify({ action: "join", sessionId: row.id }) });
      setConnection({ credentials, mic, camera, received: Date.now() });
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : "Không thể kết nối. Vui lòng thử lại.");
      void refresh();
    } finally { setPending(false); }
  }

  const refreshRoom = useCallback(() => { void refresh(); }, [refresh]);
  if (connection) return <MeetingCall {...connection} ideaId={id}
    status={status.data} statusError={status.error} statusReceived={status.dataUpdatedAt}
    exit={onExit} refresh={refreshRoom} />;

  const closed = row?.phase === "closed";
  const closing = row?.phase === "closing" || (row?.id === dismissed && !closed);
  const active = row?.phase === "active" && !closing;
  const creating = row?.phase === "creating";
  const needsMembership = status.error instanceof ApiError && status.error.code === "NOT_JOINED";

  return <section className={styles.card}>
    <Back id={id} />
    <h1>{closed ? "Cuộc họp đã kết thúc" : "Phòng họp"}</h1>
    {status.isPending && <p role="status">Đang tải phòng họp…</p>}
    {status.isError && <p role="alert">{needsMembership ? "Mở thảo luận và tham gia block để vào phòng họp." : status.error.message}</p>}
    {closed && <p>{endMessage(row.reason)}</p>}
    {closing && <p role="status">{row?.reason === "expired" || dismissed ? "Phiên họp đã hết thời gian. Hệ thống đang đóng phòng." : "Hệ thống đang đóng phòng."}</p>}
    {creating && <p role="status">Đang mở phòng…</p>}
    {active && <>
      <p>{row.participants}/{MEETING_CAPACITY} người trong phòng. Mic và camera tắt khi bạn chưa bật thử.</p>
      <div className={styles.preview}>
        {preview.video ? <PreviewVideo stream={preview.video} /> : <Video size={32} aria-hidden="true" />}
      </div>
      <div className={styles.actions}>
        <button aria-pressed={preview.audio} disabled={!!preview.pending || pending} onClick={() => void preview.toggle("audio")}>
          <Mic size={18} aria-hidden="true" /> {preview.audio ? "Tắt mic thử" : "Thử mic"}
        </button>
        <button aria-pressed={!!preview.video} disabled={!!preview.pending || pending} onClick={() => void preview.toggle("video")}>
          <Camera size={18} aria-hidden="true" /> {preview.video ? "Tắt camera thử" : "Thử camera"}
        </button>
      </div>
      {preview.error && <p role="alert">{preview.error}</p>}
      <div className={styles.actions}>
        <button className={styles.primary} disabled={pending || !!preview.pending} onClick={() => void join(preview.audio, !!preview.video)}>
          {pending ? "Đang kết nối…" : "Vào họp"}
        </button>
        <button disabled={pending || !!preview.pending} onClick={() => void join(false, false)}>Vào chỉ nghe</button>
      </div>
    </>}
    {!active && !closing && !creating && status.data?.canStart &&
      <button className={styles.primary} disabled={pending} onClick={() => void start()}>
        {pending ? "Đang mở phòng…" : closed ? "Bắt đầu cuộc họp mới" : "Bắt đầu họp"}
      </button>}
    {!active && !closing && !creating && status.data && !status.data.canStart &&
      <p>Chuyển block về Tiềm năng để bắt đầu cuộc họp mới.</p>}
    {message && <p role="alert">{message}</p>}
  </section>;
}
