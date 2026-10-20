"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Circle, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import { IDEA_STATUSES, IDEA_STATUS_LABELS, type Idea, type IdeaStatus } from "@/lib/domain";
import { Select } from "./select";

/** Shared team classification; the server independently checks room membership. */
export function IdeaStatusControl({ idea }: { idea: Idea }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: IdeaStatus) => api<Idea>(`/ideas/${encodeURIComponent(idea.id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: async updated => {
      client.setQueryData(["idea", idea.id], updated);
      await client.invalidateQueries({ queryKey: ["ideas"] });
    },
  });
  const status = idea.status ?? "potential", Icon = status === "archived" ? Archive : status === "potential" ? Sparkles : Circle;
  return <div className={`ih-classification ih-classification-${status}`} data-classification>
    <div className="ih-classification-value"><Icon size={12} aria-hidden="true"/>{idea.joined ? <Select label={`Phân loại ${idea.title}`} value={status} options={IDEA_STATUSES.map(value => ({ value, label: IDEA_STATUS_LABELS[value] }))} onChange={value => { if (value !== status) mutation.mutate(value); }} disabled={mutation.isPending}/> : <span title="Tham gia ý tưởng để thay đổi phân loại">{IDEA_STATUS_LABELS[status]}</span>}{mutation.isPending && <span className="ih-sr" role="status">Đang cập nhật phân loại</span>}</div>
    {mutation.error && <span className="ih-classification-error" role="alert">{mutation.error.message}</span>}
  </div>;
}
