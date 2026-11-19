"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LogOut, Mic, MicOff, MonitorUp, Video } from "lucide-react";
import { ConnectionState, DisconnectReason, Room, RoomEvent, Track, type Participant } from "livekit-client";
import { ApiError } from "@/lib/api-client";
import { MEETING_CAPACITY, meetingClock, type MeetingJoin, type MeetingStatus } from "@/lib/meeting";
import { mediaMessage } from "./meeting-preview";
import styles from "./meeting-room.module.css";

type Props = {
  ideaId: string;
  credentials: MeetingJoin;
  mic: boolean;
  camera: boolean;
  received: number;
  status?: MeetingStatus;
  statusReceived: number;
  statusError: unknown;
  exit: (message: string, expiredId?: string) => void;
  refresh: () => void;
};

const changes = [
  RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.ParticipantNameChanged,
  RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ConnectionStateChanged, RoomEvent.AudioPlaybackStatusChanged,
] as const;

function stopLocal(room: Room) {
  for (const publication of room.localParticipant.trackPublications.values()) publication.track?.stop();
  void room.disconnect().catch(() => {});
}

function TrackElement({ track, audio = false }: { track: Track; audio?: boolean }) {
  const element = useRef<HTMLMediaElement | null>(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    track.attach(node);
    return () => { track.detach(node); };
  }, [track]);
  return audio
    ? <audio ref={node => { element.current = node; }} autoPlay />
    : <video ref={node => { element.current = node; }} autoPlay muted playsInline />;
}

function Tile({ participant, speaking, local, screen = false, featured = false }: {
  participant: Participant; speaking: boolean; local: boolean; screen?: boolean; featured?: boolean;
}) {
  const item = participant.getTrackPublication(screen ? Track.Source.ScreenShare : Track.Source.Camera);
  return <figure className={`${styles.tile} ${screen ? styles.screen : ""} ${featured ? styles.featured : ""} ${speaking ? styles.speaking : ""}`}>
    {item?.track && !item.isMuted ? <TrackElement track={item.track} /> : <Video size={26} aria-hidden="true" />}
    <figcaption>
      {screen ? `Màn hình của ${participant.name || "thành viên"}` : (participant.name || "Thành viên")}
      {!screen && local && " (bạn)"} {!screen && speaking && " · Đang nói"}
    </figcaption>
  </figure>;
}

function countdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MeetingCall({ ideaId, credentials, mic, camera, received, status, statusReceived, statusError, exit, refresh }: Props) {
  const row = credentials.status.session!;
  const [room, setRoom] = useState<Room | null>(null);
  const [, redraw] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [clientNow, setClientNow] = useState(received);
  const [opened, setOpened] = useState(false);
  const terminated = useRef(false);
  const back = `/ideas/${encodeURIComponent(ideaId)}`;

  useEffect(() => {
    const call = new Room({ adaptiveStream: true, dynacast: true });
    let disposed = false;
    setRoom(call);
    const sync = () => { if (!disposed) redraw(value => value + 1); };
    const resync = () => { sync(); refresh(); };
    const disconnected = (reason?: DisconnectReason) => {
      if (disposed || terminated.current || reason === DisconnectReason.CLIENT_INITIATED) return;
      if (reason === DisconnectReason.DUPLICATE_IDENTITY) exit("Tài khoản của bạn đã chuyển sang thiết bị khác.");
      else if (reason === DisconnectReason.ROOM_DELETED || reason === DisconnectReason.ROOM_CLOSED) exit("Kết nối với phòng đã kết thúc.");
      else exit("Không thể duy trì kết nối. Bạn có thể vào lại nếu phiên còn mở.");
    };
    const pagehide = () => stopLocal(call);
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) exit("Bạn đã rời phòng. Bạn có thể vào lại nếu phiên còn mở.");
    };
    for (const event of changes) call.on(event, sync);
    call.on(RoomEvent.Reconnected, resync).on(RoomEvent.Disconnected, disconnected);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);

    void call.connect(credentials.url, credentials.token).then(async () => {
      if (disposed || terminated.current) { stopLocal(call); return; }
      setOpened(true);
      resync();
      const results = await Promise.allSettled([
        mic ? call.localParticipant.setMicrophoneEnabled(true) : Promise.resolve(),
        camera ? call.localParticipant.setCameraEnabled(true) : Promise.resolve(),
      ]);
      if (disposed || terminated.current) { stopLocal(call); return; }
      const failure = results.find(result => result.status === "rejected");
      if (failure) setError(mediaMessage(failure.reason));
    }).catch(() => {
      if (!disposed && !terminated.current) exit("Không thể kết nối. Nếu phòng đã đầy, hãy đợi có chỗ rồi thử lại.");
    });

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      call.removeAllListeners();
      stopLocal(call);
    };
  }, [credentials, mic, camera, exit, refresh]);

  useEffect(() => {
    const tick = () => setClientNow(Date.now());
    const resume = () => { tick(); refresh(); };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, [refresh]);

  const useLatest = !!status && statusReceived >= received;
  const source = useLatest ? status! : credentials.status;
  const sourceReceived = useLatest ? statusReceived : received;
  const clock = meetingClock(row.warnAt!, row.expiresAt!, source.serverNow + Math.max(0, clientNow - sourceReceived));
  const denied = statusError instanceof ApiError && [401, 403, 404].includes(statusError.status);
  const ended = useLatest && (status?.session?.id !== row.id || status.session.phase !== "active");
  const expired = clock.expired || (ended && status?.session?.id === row.id && status.session.reason === "expired");
  useEffect(() => {
    if (terminated.current || (!ended && !denied && !expired)) return;
    terminated.current = true;
    if (room) stopLocal(room);
    exit(expired ? "Phiên họp đã hết thời gian." : denied ? "Bạn không còn quyền vào phòng." : "Cuộc họp đã kết thúc.",
      expired ? row.id : undefined);
  }, [room, ended, denied, expired, exit, row.id]);

  const local = room?.localParticipant;
  const remotes = room ? [...room.remoteParticipants.values()] : [];
  const participants = local ? [local, ...remotes] : [];
  const speaking = new Set(room?.activeSpeakers.map(speaker => speaker.identity));
  const screen = participants.find(participant => {
    const publication = participant.getTrackPublication(Track.Source.ScreenShare);
    return publication?.track && !publication.isMuted;
  });
  const connected = room?.state === ConnectionState.Connected;
  const label = connected ? `${participants.length}/${MEETING_CAPACITY} người tham gia`
    : opened ? "Đang kết nối lại…" : "Đang kết nối…";
  const dominant = room?.activeSpeakers[0]?.identity ?? remotes[0]?.identity ?? local?.identity;
  const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const canShare = !mobile && typeof navigator.mediaDevices?.getDisplayMedia === "function";

  async function toggle(device: "microphone" | "camera" | "screen") {
    if (!local || !connected || pending) return;
    setPending(true);
    setError("");
    try {
      if (device === "microphone") await local.setMicrophoneEnabled(!local.isMicrophoneEnabled);
      if (device === "camera") await local.setCameraEnabled(!local.isCameraEnabled);
      if (device === "screen") await local.setScreenShareEnabled(!local.isScreenShareEnabled);
      if (terminated.current && room) stopLocal(room);
    } catch (failure) { setError(mediaMessage(failure)); }
    finally { setPending(false); }
  }

  return <section className={styles.call}>
    <header className={styles.callHeader}><h1>Phòng họp</h1><p role="status">{label}</p></header>
    {clock.warning && <aside className={styles.warning}>
      <p role="status">Phòng sẽ tự đóng khi hết giờ. Bạn có thể mở cuộc họp mới sau khi phiên này kết thúc.</p>
      <span aria-label="Thời gian còn lại" role="timer">{countdown(clock.remainingSeconds)}</span>
    </aside>}
    <div className={styles.stage} aria-label="Video và màn hình chia sẻ">
      {screen && <Tile participant={screen} speaking={false} local={screen === local} screen />}
      <div className={styles.grid}>
        {participants.map(participant => <Tile key={participant.identity}
          participant={participant} local={participant === local} speaking={speaking.has(participant.identity)}
          featured={!screen && participant.identity === dominant} />)}
      </div>
    </div>
    {remotes.flatMap(participant => [...participant.audioTrackPublications.values()].map(publication =>
      publication.track ? <TrackElement key={publication.trackSid} track={publication.track} audio /> : null))}
    <details className={styles.roster}><summary>Người tham gia ({participants.length})</summary>
      <ul>{participants.map(participant => <li key={participant.identity}>{participant.name || "Thành viên"}
        {participant === local && " (bạn)"} {speaking.has(participant.identity) && " · Đang nói"}</li>)}</ul>
    </details>
    {room && !room.canPlaybackAudio &&
      <button className={styles.audioStart} onClick={() => { void room.startAudio().catch(() => setError("Chạm lại để bật âm thanh.")); }}>Chạm để bật âm thanh</button>}
    {error && <p className={styles.callError} role="alert">{error}</p>}
    <div className={styles.controls}>
      <button aria-pressed={!!local?.isMicrophoneEnabled} disabled={!connected || pending} onClick={() => void toggle("microphone")}>
        {local?.isMicrophoneEnabled ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />} Mic
      </button>
      <button aria-pressed={!!local?.isCameraEnabled} disabled={!connected || pending} onClick={() => void toggle("camera")}>
        {local?.isCameraEnabled ? <Camera size={18} aria-hidden="true" /> : <CameraOff size={18} aria-hidden="true" />} Camera
      </button>
      {canShare && <button aria-pressed={!!local?.isScreenShareEnabled} disabled={!connected || pending} onClick={() => void toggle("screen")}>
        <MonitorUp size={18} aria-hidden="true" /> Chia sẻ màn hình
      </button>}
      <a className={styles.leave} href={back} onClick={() => { terminated.current = true; if (room) stopLocal(room); }}>
        <LogOut size={18} aria-hidden="true" /> Rời phòng
      </a>
    </div>
  </section>;
}
