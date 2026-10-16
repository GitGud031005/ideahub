"use client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { api } from "@/lib/api-client";
import type { IdeaSort, IdeaView, Session } from "@/lib/domain";

interface DashboardState { search: string; view: IdeaView; sort: IdeaSort; scroll: number }
interface UiState {
  dashboard: DashboardState; setDashboard: Dispatch<SetStateAction<DashboardState>>;
  sidebarOpen: boolean; setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  drafts: Record<string, string>; setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
}
const UiContext = createContext<UiState | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1 }, mutations: { retry: false } } }));
  const [dashboard, setDashboard] = useState<DashboardState>({ search: "", view: "all", sort: "new", scroll: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return <QueryClientProvider client={client}><UiContext value={{ dashboard, setDashboard, sidebarOpen, setSidebarOpen, drafts, setDrafts }}>{children}</UiContext></QueryClientProvider>;
}
export function useUi() { const state = useContext(UiContext); if (!state) throw new Error("Missing UiContext"); return state; }
export function useSession() { return useQuery({ queryKey: ["session"], queryFn: ({ signal }) => api<Session>("/session", { signal }), staleTime: 5 * 60000, refetchOnWindowFocus: false }); }
export function useDraft(key: string) {
  const { drafts, setDrafts } = useUi();
  const set = (value: string) => setDrafts(current => { if (!value) { const next = { ...current }; delete next[key]; return next; } return { ...current, [key]: value }; });
  return [drafts[key] || "", set] as const;
}
