"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { IdeasPage, IdeaView, UnreadCounts } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { CreateIdea } from "./create-idea";
import { Hero } from "./hero";
import { useAuth, useSession, useUi } from "./providers";
import { Select } from "./select";
import { ErrorState } from "./status";
import { AccountMenu } from "./account-menu";
import { TagStrip } from "./tag-strip";
import { IdeaStatusIcon } from "./idea-status";

export function Dashboard() {
  const router = useRouter(), session = useSession(), { user, ready, requestLogin } = useAuth(), { dashboard, setDashboard } = useUi();
  const [create, setCreate] = useState(false), [query, setQuery] = useState(dashboard.search);
  const search = useRef<HTMLInputElement>(null), createButton = useRef<HTMLButtonElement>(null), restored = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setQuery(dashboard.search), 200); return () => clearTimeout(timer); }, [dashboard.search]);
  const viewer = user?.id ?? "guest";
  const tabRow = useRef<HTMLDivElement>(null), results = useRef<HTMLDivElement>(null), lastResultsScope = useRef<string | null>(null);
  const [indicator, setIndicator] = useState<{left:number; width:number}>();
  const ideas = useInfiniteQuery({
    queryKey: ["ideas", { viewer, q: query, view: dashboard.view, sort: dashboard.sort }], enabled: !!session.data,
    initialPageParam: "",
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    queryFn: ({ signal, pageParam }) => api<IdeasPage>(`/ideas?${new URLSearchParams({ q: query, view: dashboard.view, sort: dashboard.sort, ...(pageParam ? { cursor: pageParam } : {}), limit: "24" })}`, { signal }),
    getNextPageParam: last => last.nextCursor ?? undefined,
    placeholderData: (previous, previousQuery) => {
      const previousScope = previousQuery?.queryKey[1] as {viewer?:string} | undefined;
      return previousScope?.viewer === viewer ? previous : undefined;
    },
    refetchInterval: 30000, refetchOnWindowFocus: "always",
  });
  const unread=useQuery({queryKey:["unread",user?.id],queryFn:({signal})=>api<UnreadCounts>("/unread",{signal}),enabled:!!user,staleTime:0,refetchInterval:5000,refetchOnWindowFocus:"always",refetchOnReconnect:"always"});
  useEffect(() => { if (ideas.data && !restored.current) { window.scrollTo({ top: dashboard.scroll, behavior: "instant" }); restored.current = true; } }, [ideas.data, dashboard.scroll]);
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.key === "/" && !document.querySelector("dialog[open]") && !create && !(event.target as HTMLElement).closest("input,textarea,select,[role=listbox]")) { event.preventDefault(); search.current?.focus(); } }; document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [create]);
  useEffect(() => { if (!user) return; const url=new URL(window.location.href); if(url.searchParams.get("new")!=="1")return;setCreate(true);url.searchParams.delete("new");window.history.replaceState(null,"",url.pathname+url.search+url.hash); }, [user]);
  const items = [...new Map(ideas.data?.pages.flatMap(p => p.items).map(item => [item.id, item]) ?? []).values()], counts = ideas.data?.pages[0].counts, total = ideas.data?.pages[0].total ?? 0;
  useLayoutEffect(() => {
    const row = tabRow.current; if (!row) return;
    const measure = () => {
      const active = row.querySelector<HTMLButtonElement>('button[aria-pressed="true"]'); if (!active) return;
      const next = {left:active.offsetLeft, width:active.offsetWidth};
      setIndicator(current => current?.left === next.left && current.width === next.width ? current : next);
      const left = next.left < row.scrollLeft ? next.left : next.left + next.width > row.scrollLeft + row.clientWidth ? next.left + next.width - row.clientWidth : row.scrollLeft;
      if (Math.abs(left - row.scrollLeft) > 1) row.scrollTo({left,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(row); row.querySelectorAll("button").forEach(button => observer.observe(button));
    return () => observer.disconnect();
  }, [dashboard.view, counts]);
  const resultsScope = JSON.stringify([viewer, query, dashboard.view, dashboard.sort]);
  useLayoutEffect(() => {
    if (!ideas.data || ideas.isPlaceholderData || lastResultsScope.current === resultsScope) return;
    const hadResults = lastResultsScope.current !== null; lastResultsScope.current = resultsScope;
    const node = results.current;
    if (!node || typeof node.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = node.animate([{opacity:hadResults ? 0.55 : 0,transform:"translateY(5px)"},{opacity:1,transform:"translateY(0)"}],{duration:220,easing:"cubic-bezier(.2,.7,.25,1)"});
    return () => animation.cancel();
  }, [ideas.data, ideas.isPlaceholderData, resultsScope]);
  const remember = () => setDashboard(current => ({ ...current, scroll: window.scrollY }));
  function enterIdea(id: string) { remember(); requestLogin(() => router.push(`/ideas/${id}`), `/ideas/${id}`); }
  function ideaLink(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); enterIdea(id);
  }
  const tabs: { value: IdeaView; label: string }[] = [{ value: "all", label: "Tất cả" }, { value: "new", label: "Mới" }, { value: "potential", label: "Tiềm năng" }, { value: "archived", label: "Lưu trữ" }, { value: "mine", label: "Của bạn" }];
  return <>
    <header className="ih-header"><Link className="ih-logo" href="/" onClick={() => setDashboard({ search: "", view: "all", sort: "new", scroll: 0 })} aria-label="IdeaHub — trang chủ">ideahub<span>.</span></Link><div className="ih-search"><Search size={16} aria-hidden="true"/><input ref={search} type="search" aria-label="Tìm kiếm ý tưởng" placeholder="Tìm một ý tưởng..." maxLength={120} value={dashboard.search} onChange={e => setDashboard(current => ({ ...current, search: e.target.value, scroll: 0 }))}/><kbd>/</kbd></div><div className="ih-header-actions"><button ref={createButton} className="ih-primary" aria-label="Tạo idea mới" disabled={!ready} onClick={() => requestLogin(() => setCreate(true), "/?new=1")}><Plus size={14} aria-hidden="true"/><span className="ih-create-label">Tạo idea mới</span></button><AccountMenu/></div></header>
    <main className="ih-main"><Hero/><section aria-label="Các ý tưởng">
      <div className="ih-toolbar ih-personal-toolbar"><div ref={tabRow} className="ih-tabs" data-indicator={indicator ? "ready" : undefined} role="group" aria-label="Lọc ý tưởng">{tabs.map(tab => <button key={tab.value} className={`ih-tab${dashboard.view === tab.value ? " ih-active" : ""}`} aria-pressed={dashboard.view === tab.value} onClick={() => { const apply = () => setDashboard(current => ({ ...current, view: tab.value, scroll: 0 })); if (tab.value === "mine" || tab.value === "potential" || tab.value === "archived") requestLogin(apply); else apply(); }}>{(tab.value === "new" || tab.value === "potential" || tab.value === "archived") && <IdeaStatusIcon status={tab.value}/>}<span className="ih-tab-label">{tab.label}</span><span className="ih-tab-count">{counts?.[tab.value] ?? "—"}</span></button>)}{indicator && <span className="ih-tab-indicator" aria-hidden="true" style={{width:indicator.width,transform:`translateX(${indicator.left}px)`}}/>}</div><div className="ih-sort-label"><span>Sắp xếp</span><Select label="Sắp xếp ý tưởng" value={dashboard.sort} onChange={sort => setDashboard(current => ({ ...current, sort, scroll: 0 }))} options={[{ value: "new", label: "Mới nhất" }, { value: "popular", label: "Nhiều người tham gia" }]}/></div></div>
      {session.error ? <ErrorState error={session.error} retry={() => { session.refetch(); }}/>: ideas.error ? <ErrorState error={ideas.error} retry={() => { ideas.refetch(); }}/> : <><div ref={results} className={`ih-idea-results${ideas.isPlaceholderData ? " ih-results-pending" : ""}`} inert={ideas.isPlaceholderData} aria-busy={ideas.isPending || session.isPending || ideas.isPlaceholderData}>
        <div className="ih-grid" aria-busy={ideas.isPending || session.isPending}>{ideas.isPending || session.isPending ? Array.from({ length: 6 }, (_, n) => <div key={n} className="ih-idea ih-skeleton" aria-hidden="true"><div/><div/><div/></div>) : items.map(idea => <article key={idea.id} className={`ih-idea${idea.status === "new" && !idea.joined ? " ih-idea-new" : ""}${idea.status === "archived" ? " ih-idea-archived" : ""}`} onClick={event => { if (!(event.target as HTMLElement).closest("a,button,[data-tags],[data-classification]") && !window.getSelection()?.toString()) { enterIdea(idea.id); } }}>
          <div className="ih-idea-heading"><h2><Link href={`/ideas/${idea.id}`} onClick={event => ideaLink(event, idea.id)}>{idea.title}</Link></h2><IdeaStatusIcon status={idea.status} card/></div><p className="ih-description">{idea.description}</p><TagStrip tags={idea.tags}/><div className="ih-card-meta"><span>{idea.memberCount} người tham gia</span><time dateTime={idea.createdAt}>Tạo {relativeTime(idea.createdAt)}</time></div><Link className="ih-join" href={`/ideas/${idea.id}`} onClick={event => ideaLink(event, idea.id)}><span>Tham gia chat</span><span className="ih-chat-indicators">{idea.joined&&!!unread.data?.[idea.id]&&<span className="ih-unread-badge" aria-label={`${unread.data[idea.id]} tin nhắn chưa đọc`}>{unread.data[idea.id]>99?"99+":unread.data[idea.id]}</span>}<ArrowUpRight size={15} aria-hidden="true"/></span></Link>
        </article>)}</div>
        {!ideas.isPending && !session.isPending && !items.length && <div className="ih-empty"><h2>Chưa có ý tưởng nào ở đây</h2><p>{query ? "Thử một từ khóa khác để tìm điều bạn quan tâm" : dashboard.view === "archived" ? "Các ý tưởng được lưu trữ sẽ xuất hiện ở đây" : "Thử phân loại khác hoặc bắt đầu một ý tưởng mới"}</p><button className="ih-secondary" onClick={() => query ? setDashboard(current => ({ ...current, search: "" })) : requestLogin(() => setCreate(true), "/?new=1")}>{query ? "Xóa tìm kiếm" : "Tạo idea đầu tiên"}</button></div>}
        {ideas.hasNextPage && <button className="ih-secondary ih-load-more" disabled={ideas.isFetchingNextPage || ideas.isPlaceholderData} onClick={() => ideas.fetchNextPage()}>{ideas.isFetchingNextPage ? "Đang tải..." : "Xem thêm ý tưởng"}</button>}
        <span className="ih-sr" role="status" aria-live="polite">{total} ý tưởng</span>
      </div>{ideas.isPlaceholderData && <span className="ih-sr" role="status">Đang lọc ý tưởng</span>}</>}
    </section></main><footer className="ih-footer"><div className="ih-footer-inner"><span className="ih-footer-logo">ideahub.</span></div></footer>
    {create && <CreateIdea onClose={() => { setCreate(false); requestAnimationFrame(() => createButton.current?.focus()); }}/>} 
  </>;
}
