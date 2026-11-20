"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Clock3, Mic, MicOff, MonitorUp, PhoneOff, UsersRound, Volume2, X } from "lucide-react";
import { ConnectionState, DisconnectReason, Room, RoomEvent, Track, type Participant } from "livekit-client";
import { ApiError } from "@/lib/api-client";
import { MEETING_CAPACITY, meetingClock, type MeetingJoin, type MeetingStatus } from "@/lib/meeting";
import { MeetingAvatar, MeetingControl } from "./meeting-controls";
import { mediaMessage } from "./meeting-preview";
import styles from "./meeting-room.module.css";

type Props = {
  ideaId: string;
  title: string;
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

function TrackElement({ track, audio = false, mirror = false }: { track: Track; audio?: boolean; mirror?: boolean }) {
  const element = useRef<HTMLMediaElement | null>(null);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    track.attach(node);
    return () => { track.detach(node); };
  }, [track]);
  return audio
    ? <audio ref={node => { element.current = node; }} autoPlay />
    : <video ref={node => { element.current = node; }} className={mirror ? styles.mirror : undefined} autoPlay muted playsInline />;
}

function Tile({ participant, speaking, local, screen = false }: {
  participant: Participant; speaking: boolean; local: boolean; screen?: boolean;
}) {
  const item = participant.getTrackPublication(screen ? Track.Source.ScreenShare : Track.Source.Camera);
  const name = participant.name || "Thành viên";
  return <figure className={`${styles.tile} ${screen ? styles.screen : ""} ${speaking ? styles.speaking : ""}`}>
    {item?.track && !item.isMuted ? <TrackElement track={item.track} mirror={local && !screen} /> : <MeetingAvatar name={name} />}
    <figcaption>
      <span>{screen ? `Màn hình của ${name}` : local ? "Bạn" : name}</span>
      {!screen && !participant.isMicrophoneEnabled && <span className={styles.mutedMic} role="img" aria-label="Mic tắt"><MicOff size={14} aria-hidden="true" /></span>}
      {!screen && speaking && <span className={styles.speakingDot} role="img" aria-label="Đang nói" />}
    </figcaption>
  </figure>;
}

function countdown(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes % 60).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}

export function MeetingCall({ ideaId, title, credentials, mic, camera, received, status, statusReceived, statusError, exit, refresh }: Props) {
  const row = credentials.status.session!;
  const [room, setRoom] = useState<Room | null>(null);
  const [, redraw] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [clientNow, setClientNow] = useState(received);
  const [opened, setOpened] = useState(false);
  const terminated = useRef(false);
  const roster = useRef<HTMLDialogElement>(null);
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
      const microphone = results[0];
      const cameraResult = results[1];
      if (microphone.status === "rejected") setError(mediaMessage(microphone.reason, "audio"));
      else if (cameraResult.status === "rejected") setError(mediaMessage(cameraResult.reason, "video"));
    }).catch(() => {
      if (!disposed && !terminated.current) exit("Chưa kết nối được với phòng. Hãy kiểm tra mạng và thử vào lại.");
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
  const serverNow = source.serverNow + Math.max(0, clientNow - sourceReceived);
  const clock = meetingClock(row.warnAt!, row.expiresAt!, serverNow);
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
  const label = opened ? "Đang kết nối lại…" : "Đang kết nối…";
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
    } catch (failure) { setError(mediaMessage(failure, device === "microphone" ? "audio" : device === "camera" ? "video" : "screen")); }
    finally { setPending(false); }
  }

  return <section className={styles.call}>
    <header className={styles.callHeader}>
      <div className={styles.callHeading}>
        <h1>{title}</h1>
        <p className={styles.callMeta}>{connected ? <>
          <span className={styles.connectedDot} aria-hidden="true" /> Đang họp
          <span className={styles.elapsed} role="timer" aria-label="Thời gian đã họp">{countdown(Math.max(0, Math.floor((serverNow - row.startedAt!) / 1000)))}</span>
        </> : <span role="status">{label}</span>}</p>
      </div>
      <button type="button" className={styles.rosterButton} aria-label={`Người tham gia (${participants.length})`}
        onClick={() => roster.current?.showModal()}>
        <UsersRound size={20} aria-hidden="true" /><span>{participants.length}</span>
      </button>
    </header>
    {clock.warning && <aside className={styles.warning}>
      <Clock3 size={18} aria-hidden="true" />
      <p role="status">Phòng sẽ tự đóng khi hết giờ.</p>
      <span aria-label="Thời gian còn lại" role="timer">{countdown(clock.remainingSeconds)}</span>
    </aside>}
    <div className={styles.stageViewport}>
      <div className={styles.stage} role="region" aria-label="Video và màn hình chia sẻ">
        {screen && <Tile participant={screen} speaking={false} local={screen === local} screen />}
        {participants.length ? <div className={styles.grid} data-count={participants.length} data-sharing={!!screen}>
          {participants.map(participant => <Tile key={participant.identity}
            participant={participant} local={participant === local} speaking={speaking.has(participant.identity)} />)}
        </div> : <div className={styles.connecting}>
          <span className={styles.spinner} aria-hidden="true" />
          <p>{label}</p>
        </div>}
        {opened && !connected && <p className={styles.reconnecting}>Video và âm thanh sẽ tiếp tục khi có kết nối.</p>}
      </div>
    </div>
    {remotes.flatMap(participant => [...participant.audioTrackPublications.values()].map(publication =>
      publication.track ? <TrackElement key={publication.trackSid} track={publication.track} audio /> : null))}
    <dialog ref={roster} className={styles.roster} aria-labelledby="meeting-roster-title"
      onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className={styles.rosterContent}>
        <header>
          <h2 id="meeting-roster-title">Người tham gia <span>{participants.length}/{MEETING_CAPACITY}</span></h2>
          <button type="button" className={styles.iconButton} aria-label="Đóng danh sách" onClick={() => roster.current?.close()}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <ul>{participants.map(participant => <li key={participant.identity}>
          <MeetingAvatar name={participant.name || "Thành viên"} />
          <span>{participant.name || "Thành viên"} {participant === local && "(bạn)"}</span>
          {participant.isMicrophoneEnabled ? <Mic size={17} role="img" aria-label="Mic bật" /> : <MicOff size={17} role="img" aria-label="Mic tắt" />}
        </li>)}</ul>
      </div>
    </dialog>
    <footer className={styles.callFooter}>
      {connected && room && !room.canPlaybackAudio && <button className={styles.audioStart} onClick={() => {
        setError("");
        void room.startAudio().catch(() => setError("Chạm lại để bật âm thanh."));
      }}><Volume2 size={19} aria-hidden="true" /> Bật âm thanh cuộc họp</button>}
      {error && <p className={styles.callError} role="alert">{error}</p>}
      <div className={styles.controls} role="group" aria-label="Điều khiển cuộc họp">
        <MeetingControl icon={local?.isMicrophoneEnabled ? Mic : MicOff} label="Mic" pressed={!!local?.isMicrophoneEnabled}
          disabled={!connected || pending} onClick={() => void toggle("microphone")} />
        <MeetingControl icon={local?.isCameraEnabled ? Camera : CameraOff} label="Camera" pressed={!!local?.isCameraEnabled}
          disabled={!connected || pending} onClick={() => void toggle("camera")} />
        {canShare && <MeetingControl icon={MonitorUp} label="Chia sẻ" pressed={!!local?.isScreenShareEnabled}
          disabled={!connected || pending} onClick={() => void toggle("screen")} />}
        <a className={styles.leave} href={back} onClick={() => { terminated.current = true; if (room) stopLocal(room); }}>
          <PhoneOff size={20} aria-hidden="true" /> <span>Rời phòng</span>
        </a>
      </div>
    </footer>
  </section>;
}
