"use client";
export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  return <div className="ih-error-state" role="alert"><p>{error?.message || "Có lỗi xảy ra, hãy thử lại"}</p>{retry && <button type="button" className="ih-secondary" onClick={retry}>Thử lại</button>}</div>;
}
export function LoadingState({ label = "Đang tải..." }: { label?: string }) {
  return <div className="ih-loading" role="status"><span className="ih-loading-dot" aria-hidden="true" />{label}</div>;
}
