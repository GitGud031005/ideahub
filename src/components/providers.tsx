"use client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { api } from "@/lib/api-client";
import {NotificationRuntime} from "./notification-bell";
import { AuthDialog } from "./auth-dialog";
import type { Account, IdeaSort, IdeaView, Session } from "@/lib/domain";

import {restorePending} from "@/lib/outbox-storage";
import {outboxKey} from "@/lib/comment-outbox";
import type { PendingComment } from "@/lib/comment-outbox";

interface DashboardState { search: string; view: IdeaView; sort: IdeaSort; scroll: number }
interface UiState {
  dashboard: DashboardState; setDashboard: Dispatch<SetStateAction<DashboardState>>;
  sidebarOpen: boolean; setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  outbox: Record<string, PendingComment[]>;setOutbox: Dispatch<SetStateAction<Record<string, PendingComment[]>>>;
  drafts: Record<string, string>; setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
}
const UiContext = createContext<UiState | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: 1 }, mutations: { retry: false } } }));
  const [dashboard, setDashboard] = useState<DashboardState>({ search: "", view: "all", sort: "activity", scroll: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outbox,setOutbox]=useState<Record<string,PendingComment[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return <QueryClientProvider client={client}><UiContext value={{ dashboard, setDashboard, sidebarOpen, setSidebarOpen, drafts, setDrafts, outbox, setOutbox }}><AuthProvider>{children}</AuthProvider></UiContext></QueryClientProvider>;
}
export function useUi() { const state = useContext(UiContext); if (!state) throw new Error("Missing UiContext"); return state; }
export function useSession() { return useQuery({ queryKey: ["session"], queryFn: ({ signal }) => api<Session>("/session", { signal }), staleTime: 30000, refetchOnWindowFocus: "always" }); }
export function useDraft(key: string) {
  const { drafts, setDrafts } = useUi();
  const set = (value: string) => setDrafts(current => { if (!value) { const next = { ...current }; delete next[key]; return next; } return { ...current, [key]: value }; });
  return [drafts[key] || "", set] as const;
}

interface AuthContextValue { user: Account | null; ready: boolean; requestLogin: (action?: () => void,returnTo?:string) => void; logout: () => Promise<void>;updateProfile:(session:Session)=>Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null);
function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSession(), client = useQueryClient(), { setDrafts, setDashboard, setOutbox } = useUi();
  const [open, setOpen] = useState(false);
  const [oauthNext,setOauthNext]=useState("/"),[authError,setAuthError]=useState("");
  const continuation = useRef<(() => void) | undefined>(undefined), opener = useRef<HTMLElement | null>(null);
  function requestLogin(action?: () => void,returnTo?:string) {
    if (session.data?.user) { action?.(); return; }
    continuation.current = action; setOauthNext(returnTo||window.location.pathname+window.location.search);setAuthError("");opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true);
  }
  function close() { setOpen(false); continuation.current = undefined; requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); }); }
  async function update(next: Session) {
    await client.cancelQueries();
    client.removeQueries({ predicate: query => query.queryKey[0] !== "session" });
    client.setQueryData(["session"], next); setDrafts({});setOutbox({});
    setDashboard(current => ({ ...current, view: "all", scroll: 0 }));
  }
  async function success(next: Session) { await update(next); const action = continuation.current; continuation.current = undefined; setOpen(false); action?.(); }
  async function logout() { let endpoint="";if("serviceWorker" in navigator){const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager.getSubscription();endpoint=subscription?.endpoint??"";}
    const next=await api<Session>("/auth/logout",{method:"POST",headers:endpoint?{"x-push-endpoint":endpoint}:{}});
    if("serviceWorker" in navigator)void navigator.serviceWorker.getRegistration().then(r=>r?.active?.postMessage({type:"ACCOUNT",userId:null})); await update(next); }
  async function updateProfile(next:Session){await client.cancelQueries({queryKey:["session"]});client.setQueryData(["session"],next);await client.invalidateQueries({predicate:q=>["ideas","idea","comments"].includes(String(q.queryKey[0]))});}
  useEffect(()=>{const url=new URL(window.location.href),error=url.searchParams.get("authError");if(!error)return;url.searchParams.delete("authError");window.history.replaceState(null,"",url.pathname+url.search+url.hash);setAuthError(error==="cancelled"?"Bạn đã hủy đăng nhập Google":"Chưa đăng nhập được bằng Google. Vui lòng thử lại");setOpen(true);},[]);
  useEffect(() => {
    const expired = () => { client.setQueryData<Session>(["session"], current => ({ storage: current?.storage ?? "postgres", user: null })); continuation.current = undefined; setOpen(true); };
    window.addEventListener("ideahub:auth-required", expired); return () => window.removeEventListener("ideahub:auth-required", expired);
  }, [client]);
  useEffect(()=>{const userId=session.data?.user?.id;if(!userId)return;let disposed=false;void restorePending(userId).then(items=>{if(disposed)return;setOutbox(current=>{const next={...current};for(const entry of items){const key=outboxKey(entry.ideaId,userId);if(!(next[key]??[]).some(c=>c.id===entry.id))next[key]=[...(next[key]??[]),entry];}return next;});}).catch(()=>{});return()=>{disposed=true;};},[session.data?.user?.id,setOutbox]);
  return <AuthContext value={{ user: session.data?.user ?? null, ready: session.isSuccess, requestLogin, logout,updateProfile }}>{children}<NotificationRuntime/>{open && <AuthDialog onClose={close} onSuccess={success} oauthNext={oauthNext} initialError={authError}/>}</AuthContext>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("Missing AuthContext"); return value; }
