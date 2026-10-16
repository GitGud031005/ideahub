"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { IdeasPage, IdeaView } from "@/lib/domain";
import { relativeTime } from "@/lib/format";
import { CreateIdea } from "./create-idea";
import { Hero } from "./hero";
import { useAuth, useSession, useUi } from "./providers";
import { Select } from "./select";
import { ErrorState } from "./status";
import { AccountMenu } from "./account-menu";
import { TagStrip } from "./tag-strip";

export function Dashboard() {
  const router = useRouter(), session = useSession(), { user, ready, requestLogin } = useAuth(), { dashboard, setDashboard } = useUi();
  const [create, setCreate] = useState(false), [query, setQuery] = useState(dashboard.search);
  const search = useRef<HTMLInputElement>(null), createButton = useRef<HTMLButtonElement>(null), restored = useRef(false);
  useEffect(() => { const timer = setTimeout(() => setQuery(dashboard.search), 200); return () => clearTimeout(timer); }, [dashboard.search]);
  const ideas = useInfiniteQuery({
    queryKey: ["ideas", { viewer: user?.id ?? "guest", q: query, view: dashboard.view, sort: dashboard.sort }], enabled: !!session.data,
    initialPageParam: 0,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
    queryFn: ({ signal, pageParam }) => api<IdeasPage>(`/ideas?${new URLSearchParams({ q: query, view: dashboard.view, sort: dashboard.sort, offset: String(pageParam), limit: "24" })}`, { signal }),
    getNextPageParam: (last, pages) => { const loaded = pages.reduce((total, page) => total + page.items.length, 0); return loaded < last.total ? loaded : undefined; },
  });
  useEffect(() => { if (ideas.data && !restored.current) { window.scrollTo({ top: dashboard.scroll, behavior: "instant" }); restored.current = true; } }, [ideas.data, dashboard.scroll]);
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.key === "/" && !document.querySelector("dialog[open]") && !create && !(event.target as HTMLElement).closest("input,textarea,select,[role=listbox]")) { event.preventDefault(); search.current?.focus(); } }; document.addEventListener("keydown", keydown); return () => document.removeEventListener("keydown", keydown); }, [create]);
  const items = ideas.data?.pages.flatMap(p => p.items) ?? [], counts = ideas.data?.pages[0].counts, total = ideas.data?.pages[0].total ?? 0;
  const remember = () => setDashboard(current => ({ ...current, scroll: window.scrollY }));
  function enterIdea(id: string) { remember(); requestLogin(() => router.push(`/ideas/${id}`)); }
  function ideaLink(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); enterIdea(id);
  }
  const tabs: { value: IdeaView; label: string }[] = [{ value: "all", label: "Tất cả ý tưởng" }, { value: "joined", label: "Đã tham gia" }, { value: "mine", label: "Của bạn" }];
  return <>
    <header className="ih-header"><Link className="ih-logo" href="/" onClick={() => setDashboard({ search: "", view: "all", sort: "new", scroll: 0 })} aria-label="IdeaHub — trang chủ">ideahub<span>.</span></Link><div className="ih-search"><Search size={16} aria-hidden="true"/><input ref={search} type="search" aria-label="Tìm kiếm ý tưởng" placeholder="Tìm một ý tưởng..." maxLength={120} value={dashboard.search} onChange={e => setDashboard(current => ({ ...current, search: e.target.value, scroll: 0 }))}/><kbd>/</kbd></div><div className="ih-header-actions"><button ref={createButton} className="ih-primary" aria-label="Tạo idea mới" disabled={!ready} onClick={() => requestLogin(() => setCreate(true))}><Plus size={14} aria-hidden="true"/><span className="ih-create-label">Tạo idea mới</span></button><AccountMenu/></div></header>
    <main className="ih-main"><Hero/><section aria-label="Các ý tưởng">
      <div className="ih-toolbar"><div className="ih-tabs" role="group" aria-label="Lọc ý tưởng">{tabs.map(tab => <button key={tab.value} className={`ih-tab${dashboard.view === tab.value ? " ih-active" : ""}`} aria-pressed={dashboard.view === tab.value} onClick={() => { const apply = () => setDashboard(current => ({ ...current, view: tab.value, scroll: 0 })); if (tab.value !== "all") requestLogin(apply); else apply(); }}>{tab.label}<span>{counts?.[tab.value] ?? "—"}</span></button>)}</div><div className="ih-sort-label"><span>Sắp xếp</span><Select label="Sắp xếp ý tưởng" value={dashboard.sort} onChange={sort => setDashboard(current => ({ ...current, sort, scroll: 0 }))} options={[{ value: "new", label: "Mới nhất" }, { value: "popular", label: "Nhiều người tham gia" }]}/></div></div>
      {session.error ? <ErrorState error={session.error} retry={() => { session.refetch(); }}/>: ideas.error ? <ErrorState error={ideas.error} retry={() => { ideas.refetch(); }}/> : <>
        <div className="ih-grid" aria-busy={ideas.isPending || session.isPending}>{ideas.isPending || session.isPending ? Array.from({ length: 6 }, (_, n) => <div key={n} className="ih-idea ih-skeleton" aria-hidden="true"><div/><div/><div/></div>) : items.map(idea => <article key={idea.id} className="ih-idea" onClick={event => { if (!(event.target as HTMLElement).closest("a,button,[data-tags]") && !window.getSelection()?.toString()) { enterIdea(idea.id); } }}>
          <div className="ih-idea-heading"><h2><Link href={`/ideas/${idea.id}`} onClick={event => ideaLink(event, idea.id)}>{idea.title}</Link></h2><span className={`ih-state${idea.joined ? " ih-state-joined" : ""}`} role="img" aria-label={idea.joined ? "Đã tham gia" : "Chưa tham gia"}>{idea.joined && <Check size={11} aria-hidden="true"/>}</span></div><p className="ih-description">{idea.description}</p><TagStrip tags={idea.tags}/><div className="ih-card-meta"><span>{idea.memberCount} người tham gia</span><time dateTime={idea.createdAt}>Tạo {relativeTime(idea.createdAt)}</time></div><Link className="ih-join" href={`/ideas/${idea.id}`} onClick={event => ideaLink(event, idea.id)}><span>Tham gia chat</span><ArrowUpRight size={15} aria-hidden="true"/></Link>
        </article>)}</div>
        {!ideas.isPending && !session.isPending && !items.length && <div className="ih-empty"><h2>Chưa có ý tưởng nào ở đây</h2><p>{query ? "Thử một từ khóa khác để tìm điều bạn quan tâm" : "Bắt đầu một cuộc trò chuyện bằng ý tưởng của bạn"}</p><button className="ih-secondary" onClick={() => query ? setDashboard(current => ({ ...current, search: "" })) : requestLogin(() => setCreate(true))}>{query ? "Xóa tìm kiếm" : "Tạo idea đầu tiên"}</button></div>}
        {ideas.hasNextPage && <button className="ih-secondary ih-load-more" disabled={ideas.isFetchingNextPage} onClick={() => ideas.fetchNextPage()}>{ideas.isFetchingNextPage ? "Đang tải..." : "Xem thêm ý tưởng"}</button>}
        <span className="ih-sr" role="status" aria-live="polite">{total} ý tưởng</span>
      </>}
    </section></main><footer className="ih-footer"><div className="ih-footer-inner"><span className="ih-footer-logo">ideahub.</span></div></footer>
    {create && <CreateIdea onClose={() => { setCreate(false); requestAnimationFrame(() => createButton.current?.focus()); }}/>} 
  </>;
}
