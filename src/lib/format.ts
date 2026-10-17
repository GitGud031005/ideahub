export function initials(name: string) {
  const parts = name.trim().normalize("NFC").split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] || "?").toLocaleUpperCase("vi");
}
export function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
export function relativeTime(value: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(new Date(value));
}
export function buildCommentForest<T extends { id: string; parentId: string | null; createdAt: string }>(items: T[], sort: "old" | "new") {
  const ids = new Set(items.map(item => item.id));
  const children = new Map<string | null, T[]>();
  for (const item of items) {
    const parent = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const branch = children.get(parent) ?? [];
    branch.push(item); children.set(parent, branch);
  }
  for (const branch of children.values()) branch.sort((a, b) => {
    const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
    return sort === "new" ? -delta : delta;
  });
  return children;
}
