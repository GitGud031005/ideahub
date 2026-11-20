import type { LucideIcon } from "lucide-react";
import { Avatar } from "./avatar";
import styles from "./meeting-room.module.css";

export function MeetingAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initials = name.trim().split(/\s+/).slice(-2).map(word => Array.from(word)[0]).join("");
  return <Avatar person={{ initial: initials || "?", avatarUrl }} className={styles.avatar} />;
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
