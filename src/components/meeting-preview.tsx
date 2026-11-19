"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function mediaMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Trình duyệt chưa cho phép dùng thiết bị. Bạn có thể tiếp tục ở chế độ chỉ nghe.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "Không tìm thấy thiết bị. Bạn có thể tiếp tục ở chế độ chỉ nghe.";
  return "Không mở được thiết bị. Bạn có thể tiếp tục ở chế độ chỉ nghe.";
}

type Device = "audio" | "video";

export function useMeetingPreview() {
  const streams = useRef(new Map<Device, MediaStream>());
  const generation = useRef(0);
  const [audio, setAudio] = useState(false);
  const [video, setVideo] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Device | null>(null);

  const stopTracks = useCallback(() => {
    generation.current++;
    for (const stream of streams.current.values()) for (const track of stream.getTracks()) track.stop();
    streams.current.clear();
  }, []);

  useEffect(() => {
    return stopTracks;
  }, [stopTracks]);

  const stop = useCallback(() => {
    stopTracks();
    setAudio(false);
    setVideo(null);
    setPending(null);
  }, [stopTracks]);

  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, [stop]);

  async function toggle(device: Device) {
    const current = streams.current.get(device);
    setError("");
    if (current) {
      for (const track of current.getTracks()) track.stop();
      streams.current.delete(device);
      if (device === "audio") setAudio(false); else setVideo(null);
      return;
    }
    const request = ++generation.current;
    setPending(device);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error();
      const stream = await navigator.mediaDevices.getUserMedia({ [device]: true });
      if (request !== generation.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streams.current.set(device, stream);
      if (device === "audio") setAudio(true); else setVideo(stream);
    } catch (failure) {
      if (request === generation.current) setError(mediaMessage(failure));
    } finally {
      if (request === generation.current) setPending(null);
    }
  }

  return { audio, video, toggle, stop, error, pending };
}

export function PreviewVideo({ stream }: { stream: MediaStream }) {
  const element = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = element.current;
    if (video) video.srcObject = stream;
    return () => { if (video) video.srcObject = null; };
  }, [stream]);
  return <video ref={element} autoPlay muted playsInline aria-label="Hình ảnh thử từ camera của bạn" />;
}
