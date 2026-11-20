"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function mediaMessage(error: unknown, device?: Device | "screen") {
  const nameOfDevice = device === "audio" ? "mic" : device === "video" ? "camera" : "thiết bị";
  const name = error instanceof Error ? error.name : "";
  if (device === "screen") {
    return "Chưa chia sẻ màn hình. Bạn có thể thử lại từ nút Chia sẻ.";
  }
  if (name === "NotAllowedError" || name === "SecurityError")
    return `Trình duyệt chưa cấp quyền dùng ${nameOfDevice}. Hãy kiểm tra quyền của trang hoặc tiếp tục cuộc họp.`;
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return `Không tìm thấy ${nameOfDevice}. Hãy kiểm tra kết nối thiết bị.`;
  return `Không bật được ${nameOfDevice}. Bạn có thể thử lại.`;
}

type Device = "audio" | "video";

export function useMeetingPreview() {
  const streams = useRef(new Map<Device, MediaStream>());
  const generation = useRef(0);
  const [audio, setAudio] = useState<MediaStream | null>(null);
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
    setAudio(null);
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
      if (device === "audio") setAudio(null); else setVideo(null);
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
      if (device === "audio") setAudio(stream); else setVideo(stream);
    } catch (failure) {
      if (request === generation.current) setError(mediaMessage(failure, device));
    } finally {
      if (request === generation.current) setPending(null);
    }
  }

  return { audio, video, toggle, stop, error, pending };
}

export function useMicSignal(stream: MediaStream | null) {
  const [signal, setSignal] = useState(false);
  useEffect(() => {
    setSignal(false);
    if (!stream) return;
    const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) return;

    let context: AudioContext | undefined;
    let interval: number | undefined;
    try {
      context = new Audio();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      void context.resume().catch(() => {});
      interval = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples);
        setSignal(samples.some(value => Math.abs(value - 128) > 5));
      }, 160);
    } catch {
      void context?.close().catch(() => {});
      return;
    }

    return () => {
      window.clearInterval(interval);
      void context?.close().catch(() => {});
    };
  }, [stream]);
  return stream && signal;
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
