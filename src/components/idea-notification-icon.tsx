import { Bell, BellOff } from "lucide-react";

export function IdeaNotificationIcon({ muted = false, joined }: { muted?: boolean; joined: boolean }) {
  const off = joined && muted;
  const label = off ? "Thông báo đang tắt" : joined ? "Thông báo đang bật" : "Thông báo mặc định bật khi tham gia";
  const Icon = off ? BellOff : Bell;
  return <span className={`ih-card-notification${off ? " ih-card-notification-muted" : ""}`} data-label={label} data-notification-state={off ? "off" : "on"} role="img" aria-label={label} tabIndex={0}><Icon size={13} aria-hidden="true"/></span>;
}
