"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, X } from "lucide-react";
import { meetingApi } from "@/lib/meeting";
import styles from "./meeting-room.module.css";

export function MeetingLinkShare({ ideaId, title }: { ideaId: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function share() {
    const url = new URL(meetingApi(ideaId), window.location.origin).href;
    setMessage("");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Đã sao chép link");
    } catch {
      setLink(url);
      dialog.current?.showModal();
    }
  }

  return <div className={styles.linkShare}>
    <button type="button" className={styles.rosterButton} onClick={() => void share()}>
      <Link2 size={18} aria-hidden="true" /><span>Gửi link</span>
    </button>
    <div role="status" className={styles.linkStatus} hidden={!message}>{message}</div>
    <dialog className={styles.roster} ref={dialog} aria-labelledby="meeting-link-title">
      <div className={styles.rosterContent}>
        <header>
          <h2 id="meeting-link-title">Link phòng họp</h2>
          <button type="button" className={styles.iconButton} aria-label="Đóng link phòng họp" onClick={() => dialog.current?.close()}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <p>Chọn địa chỉ bên dưới để sao chép và gửi.</p>
        <input className={styles.linkField} aria-label="Địa chỉ phòng họp" value={link} readOnly onFocus={event => event.currentTarget.select()} />
      </div>
    </dialog>
  </div>;
}
