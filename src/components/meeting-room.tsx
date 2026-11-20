"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Camera, CameraOff, Mic, MicOff, UsersRound, Video } from "lucide-react";
import { ApiError, api } from "@/lib/api-client";
import type { Idea } from "@/lib/domain";
import { MEETING_CAPACITY, meetingApi, type MeetingEndReason, type MeetingJoin, type MeetingStatus } from "@/lib/meeting";
import { useAuth } from "./providers";
import { MeetingAvatar, MeetingControl } from "./meeting-controls";
import { PreviewVideo, useMeetingPreview, useMicSignal } from "./meeting-preview";
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
  const idea = useQuery({
    queryKey: ["idea", id],
    queryFn: ({ signal }) => api<Idea>(`/ideas/${encodeURIComponent(id)}`, { signal }),
  });
  const title = idea.data?.title || "Phòng họp";
  return <main className={styles.page}>
    {ready && user ? <MemberRoom key={user.id} id={id} userId={user.id} name={user.name} title={title} />
      : <div className={styles.lobby}>
        <header className={styles.lobbyHeader}><Back id={id} /></header>
        <section className={styles.accessCard}>
          <span className={styles.accessIcon}><Video size={24} aria-hidden="true" /></span>
          <h1>{title}</h1>
          {ready ? <>
            <p>Đăng nhập bằng tài khoản IdeaHub để vào phòng họp.</p>
            <button className={styles.primary} onClick={() => requestLogin()}>Đăng nhập</button>
          </> : <p role="status">Đang tải phòng họp…</p>}
        </section>
      </div>}
  </main>;
}

function Back({ id }: { id: string }) {
  return <a className={styles.back} href={`/ideas/${encodeURIComponent(id)}`}>
    <ArrowLeft size={17} aria-hidden="true" /> Quay lại thảo luận
  </a>;
}

function MemberRoom({ id, userId, name, title }: { id: string; userId: string; name: string; title: string }) {
  const path = meetingApi(id);
  const queryClient = useQueryClient();
  const queryKey = ["meeting", id, userId];
  const status = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<MeetingStatus>(path, { signal }),
    refetchInterval: 5000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const refresh = status.refetch;
  const preview = useMeetingPreview();
  const micSignal = useMicSignal(preview.audio);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [connection, setConnection] = useState<{ credentials: MeetingJoin; mic: boolean; camera: boolean; received: number } | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const row = status.data?.session;
  const stopPreview = preview.stop;
  const closed = row?.phase === "closed";
  const closing = row?.phase === "closing" || (!!row && row.id === dismissed && !closed);
  const active = row?.phase === "active" && !closing;
  const creating = row?.phase === "creating";
  const canStart = !active && !closing && !creating && !!status.data?.canStart;
  const canPrepare = !status.isError && (active || canStart || creating);
  const needsMembership = status.error instanceof ApiError && status.error.code === "NOT_JOINED";
  useEffect(() => {
    if (!canPrepare) stopPreview();
  }, [canPrepare, stopPreview]);

  const onExit = useCallback((message: string, expiredId?: string) => {
    setConnection(null);
    setMessage(message);
    if (expiredId) setDismissed(expiredId);
    void refresh();
  }, [refresh]);

  async function enter(listenOnly = false) {
    if (pending || preview.pending || (!canStart && !active)) return;
    const mic = !listenOnly && !!preview.audio;
    const camera = !listenOnly && !!preview.video;
    setPending(true);
    setMessage("");
    try {
      let target = row;
      if (canStart) {
        const result = await api<MeetingStatus>(path, { method: "POST", body: JSON.stringify({ action: "start", afterId: row?.id ?? null }) });
        queryClient.setQueryData(queryKey, result);
        target = result.session ?? undefined;
      }
      if (!target || target.phase !== "active") return;
      preview.stop();
      const credentials = await api<MeetingJoin>(path, { method: "POST", body: JSON.stringify({ action: "join", sessionId: target.id }) });
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, credentials.status);
      setConnection({ credentials, mic, camera, received: Date.now() });
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : "Chưa thể vào phòng. Vui lòng thử lại.");
      void refresh();
    } finally { setPending(false); }
  }

  const refreshRoom = useCallback(() => { void refresh(); }, [refresh]);
  if (connection) return <MeetingCall {...connection} ideaId={id} title={title}
    status={status.data} statusError={status.error} statusReceived={status.dataUpdatedAt}
    exit={onExit} refresh={refreshRoom} />;

  return <div className={styles.lobby}>
    <header className={styles.lobbyHeader}><Back id={id} /></header>
    <section className={canPrepare ? styles.lobbyLayout : styles.accessCard} aria-labelledby="meeting-title">
      <div className={styles.lobbyDetails}>
        {title !== "Phòng họp" && <span className={styles.eyebrow}><Video size={16} aria-hidden="true" /> Phòng họp</span>}
        <h1 id="meeting-title">{title}</h1>
        {status.isPending && <p role="status">Đang tải phòng họp…</p>}
        {status.isError && <p className={styles.notice} role="alert">{needsMembership ? "Bạn cần tham gia block này trước khi vào họp." : status.error.message}</p>}
        {needsMembership && <a className={styles.primary} href={`/ideas/${encodeURIComponent(id)}`}>Mở thảo luận <ArrowRight size={17} aria-hidden="true" /></a>}
        {status.isError && !needsMembership && <button className={styles.secondary} onClick={refreshRoom}>Thử lại</button>}
        {closed && !message && <p>{endMessage(row.reason)}</p>}
        {closing && <p role="status">{row?.reason === "expired" || dismissed ? "Đã hết thời gian. Phòng đang đóng." : "Phòng đang đóng."}</p>}
        {creating && <p role="status">Đang mở phòng…</p>}
        {active && <p className={styles.members} role="status"><UsersRound size={17} aria-hidden="true" />
          {row.participants ? `${row.participants} / ${MEETING_CAPACITY} người trong phòng` : "Chưa có người trong phòng"}</p>}
        {canStart && !closed && <p>Bạn sẽ là người đầu tiên vào họp.</p>}
        {!active && !closing && !creating && status.data && !canStart && !status.isError &&
          <p>Chuyển block về Tiềm năng để bắt đầu cuộc họp mới.</p>}
        {message && <p className={styles.notice} role="alert">{message}</p>}
      </div>
      {canPrepare && <>
        <div className={styles.lobbyMedia}>
          <div className={styles.preview}>
            {preview.video ? <PreviewVideo stream={preview.video} /> : <div className={styles.previewPlaceholder}>
              <MeetingAvatar name={name} /><span>Camera đang tắt</span>
            </div>}
            <span className={styles.selfLabel}>Bạn</span>
          </div>
          <div className={styles.preflight} role="group" aria-label="Thiết bị trước khi vào họp">
            <MeetingControl icon={preview.audio ? Mic : MicOff} label="Mic" pressed={!!preview.audio}
              disabled={!!preview.pending || pending} onClick={() => void preview.toggle("audio")} />
            <MeetingControl icon={preview.video ? Camera : CameraOff} label="Camera" pressed={!!preview.video}
              disabled={!!preview.pending || pending} onClick={() => void preview.toggle("video")} />
            <span className={styles.deviceState}>{preview.pending ? "Đang chờ quyền thiết bị…" : preview.audio ?
              <><span className={styles.micIndicator} data-signal={!!micSignal} aria-hidden="true" />{micSignal ? "Mic nhận tiếng" : "Mic đang bật"}</> : "Mic đang tắt"}</span>
          </div>
          {preview.error && <p className={styles.notice} role="alert">{preview.error}</p>}
        </div>
        <div className={styles.lobbyActions}>
          <button className={styles.primary} disabled={pending || !!preview.pending || creating} onClick={() => void enter()}>
            <Video size={19} aria-hidden="true" />
            {pending ? (active ? "Đang kết nối…" : "Đang mở phòng…") : creating ? "Đang mở phòng…" :
              active ? "Vào họp" : closed ? "Bắt đầu cuộc họp mới" : "Bắt đầu và vào họp"}
          </button>
          {(preview.audio || preview.video) &&
            <button className={styles.secondary} disabled={pending || !!preview.pending || creating} onClick={() => void enter(true)}>Vào chỉ nghe</button>}
        </div>
      </>}
    </section>
  </div>;
}
