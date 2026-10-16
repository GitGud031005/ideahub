"use client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { api } from "@/lib/api-client";
import { AuthDialog } from "./auth-dialog";
import type { Account, IdeaSort, IdeaView, Session } from "@/lib/domain";

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
  return <QueryClientProvider client={client}><UiContext value={{ dashboard, setDashboard, sidebarOpen, setSidebarOpen, drafts, setDrafts }}><AuthProvider>{children}</AuthProvider></UiContext></QueryClientProvider>;
}
export function useUi() { const state = useContext(UiContext); if (!state) throw new Error("Missing UiContext"); return state; }
export function useSession() { return useQuery({ queryKey: ["session"], queryFn: ({ signal }) => api<Session>("/session", { signal }), staleTime: 30000, refetchOnWindowFocus: "always" }); }
export function useDraft(key: string) {
  const { drafts, setDrafts } = useUi();
  const set = (value: string) => setDrafts(current => { if (!value) { const next = { ...current }; delete next[key]; return next; } return { ...current, [key]: value }; });
  return [drafts[key] || "", set] as const;
}

interface AuthContextValue { user: Account | null; ready: boolean; requestLogin: (action?: () => void) => void; logout: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);
function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSession(), client = useQueryClient(), { setDrafts, setDashboard } = useUi();
  const [open, setOpen] = useState(false);
  const continuation = useRef<(() => void) | undefined>(undefined), opener = useRef<HTMLElement | null>(null);
  function requestLogin(action?: () => void) {
    if (session.data?.user) { action?.(); return; }
    continuation.current = action; opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true);
  }
  function close() { setOpen(false); continuation.current = undefined; requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); }); }
  async function update(next: Session) {
    await client.cancelQueries();
    client.removeQueries({ predicate: query => query.queryKey[0] !== "session" });
    client.setQueryData(["session"], next); setDrafts({});
    setDashboard(current => ({ ...current, view: "all", scroll: 0 }));
  }
  async function success(next: Session) { await update(next); const action = continuation.current; continuation.current = undefined; setOpen(false); action?.(); }
  async function logout() { const next = await api<Session>("/auth/logout", { method: "POST" }); await update(next); }
  useEffect(() => {
    const expired = () => { client.setQueryData<Session>(["session"], current => ({ storage: current?.storage ?? "postgres", user: null })); continuation.current = undefined; setOpen(true); };
    window.addEventListener("ideahub:auth-required", expired); return () => window.removeEventListener("ideahub:auth-required", expired);
  }, [client]);
  return <AuthContext value={{ user: session.data?.user ?? null, ready: session.isSuccess, requestLogin, logout }}>{children}{open && <AuthDialog onClose={close} onSuccess={success}/>}</AuthContext>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("Missing AuthContext"); return value; }
