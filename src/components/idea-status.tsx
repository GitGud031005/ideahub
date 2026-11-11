"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check } from "lucide-react";
import { api } from "@/lib/api-client";
import { IDEA_STATUS_LABELS, type Idea, type IdeaStatus, type JoinedIdeaStatus } from "@/lib/domain";
import {useAuth} from "./providers";
import { Select } from "./select";

export function IdeaStatusIcon({ status, card = false }: { status: IdeaStatus; card?: boolean }) {
  const Icon = status === "archived" ? Archive : Check;
  return <span className={`ih-status-icon ih-status-${status}${card ? " ih-card-status" : ""}`} data-label={IDEA_STATUS_LABELS[status]} role={card ? "img" : undefined} aria-label={card ? IDEA_STATUS_LABELS[status] : undefined} aria-hidden={card ? undefined : true} tabIndex={card ? 0 : undefined}>{status === "archived" && <svg className="ih-status-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" pathLength="70" strokeDasharray="3.5 3.5"/></svg>}{status === "new" ? <span className="ih-status-exclamation" aria-hidden="true">!</span> : <Icon size={13} aria-hidden="true"/>}</span>;
}

/** Every signed-in viewer may update the shared classification, without joining. */
export function IdeaStatusControl({ idea }: { idea: Idea }) {
  const client = useQueryClient(),{user}=useAuth();
  const mutation = useMutation({
    mutationFn: (status: JoinedIdeaStatus) => api<Idea>(`/ideas/${encodeURIComponent(idea.id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: async updated => {
      client.setQueryData(["idea", idea.id], updated);
      await client.invalidateQueries({ queryKey: ["ideas"] });
    },
  });
  if (!user) return null;
  const status = idea.status === "archived" ? "archived" : "potential";
  return <div className={`ih-personal-classification ih-status-${status}`} data-classification>
    <Select label={`Trạng thái chung của ${idea.title}`} value={status} options={(["potential", "archived"] as const).map(value => ({ value, label: IDEA_STATUS_LABELS[value], icon: <IdeaStatusIcon status={value}/> }))} onChange={value => { if (value !== status) mutation.mutate(value); }} disabled={mutation.isPending}/>
    <span className="ih-classification-note">Áp dụng cho mọi người</span>
    {mutation.isPending && <span className="ih-sr" role="status">Đang cập nhật trạng thái chung</span>}
    {mutation.error && <span className="ih-classification-error" role="alert">{mutation.error.message}</span>}
  </div>;
}
