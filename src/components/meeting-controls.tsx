import type { LucideIcon } from "lucide-react";
import styles from "./meeting-room.module.css";

export function MeetingAvatar({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).slice(-2).map(word => Array.from(word)[0]).join("");
  return <span className={styles.avatar} aria-hidden="true">{initials || "?"}</span>;
}

export function MeetingControl({ icon: Icon, label, pressed, disabled, onClick }: {
  icon: LucideIcon;
  label: string;
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return <button type="button" className={styles.control} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
    <Icon size={21} aria-hidden="true" />
    <span>{label}</span>
  </button>;
}
