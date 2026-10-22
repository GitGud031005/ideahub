"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowUpRight, BookOpen, Menu, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { LessonMeta, SearchEntry } from "@/content/business-for-startup/types";
import { searchStartup } from "@/lib/startup-search";
const base = "/business-for-startup";
function ChapterNav({ catalog, groups, pathname, onNavigate }: { catalog: LessonMeta[]; groups: string[]; pathname: string; onNavigate?: () => void }) {
  return <nav className="bfs-chapter-nav" aria-label="Các chương khởi nghiệp"><Link href={base} onClick={onNavigate} className="bfs-nav-overview" aria-current={pathname === base ? "page" : undefined}><BookOpen size={16}/>Tổng quan</Link>{groups.map((group, index) => <div className="bfs-nav-group" key={group}><p>{group}</p>{catalog.filter(l => l.group === index).map(lesson => <Link key={lesson.slug} href={`${base}/${lesson.slug}`} onClick={onNavigate} aria-current={pathname === `${base}/${lesson.slug}` ? "page" : undefined}><span>{lesson.chapter === null ? "↗" : String(lesson.chapter).padStart(2, "0")}</span><span>{lesson.title}</span></Link>)}</div>)}</nav>;
}
export function StartupShell({ catalog, groups, entries, children }: { catalog: LessonMeta[]; groups: string[]; entries: SearchEntry[]; children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState(""), [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null), menu = useRef<HTMLButtonElement>(null);
  const searchId = useId();
  const results = useMemo(() => searchStartup(entries, query), [entries, query]);
  useEffect(() => { setSearchOpen(false); setQuery(""); dialog.current?.close(); }, [pathname]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "/" && !document.querySelector("dialog[open]") && !(event.target as HTMLElement).closest("input,textarea,select,[contenteditable=true]")) { event.preventDefault(); input.current?.focus(); setSearchOpen(true); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, []);
  const navigate = () => { setSearchOpen(false); dialog.current?.close(); };
  return <div className="bfs-root">
    <a className="bfs-skip" href="#startup-content">Đến nội dung</a>
    <header className="bfs-header"><div className="bfs-brand"><Link className="ih-logo" href="/" aria-label="IdeaHub — trang chủ">ideahub<span>.</span></Link><span className="bfs-brand-divider"/><Link className="bfs-brand-label" href={base}>Business for Startup</Link></div>
      <div className="bfs-search" ref={searchRef} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setSearchOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setSearchOpen(false); input.current?.focus(); } }}>
        <div className="bfs-search-field" role="search"><Search size={17} aria-hidden="true"/><input ref={input} type="search" aria-label="Tìm trong tài liệu khởi nghiệp" placeholder="Tìm trong tài liệu..." maxLength={160} value={query} onFocus={() => setSearchOpen(true)} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} aria-controls={searchOpen && query.trim() ? searchId : undefined}/>{query ? <button type="button" aria-label="Xóa tìm kiếm tài liệu" onClick={() => { setQuery(""); input.current?.focus(); }}><X size={15}/></button> : <kbd>/</kbd>}</div>
        {searchOpen && query.trim() && <div className="bfs-search-results" id={searchId}><p role="status">{results.length ? `${results.length} mục phù hợp${results.length > 8 ? " · hiển thị 8 mục đầu" : ""}` : "Không tìm thấy mục phù hợp"}</p>{results.length ? <nav aria-label="Kết quả tìm kiếm tài liệu">{results.slice(0, 8).map(result => <Link href={result.href} key={result.href} onClick={navigate}><small>{result.lesson}</small><strong>{result.title}</strong><span>{result.snippet}</span><ArrowUpRight size={14} aria-hidden="true"/></Link>)}</nav> : <div className="bfs-search-empty">Thử từ ngắn hơn, chẳng hạn “MVP”, “dòng tiền” hoặc “doi thu”. Có thể tìm bằng tiếng Việt không dấu.</div>}</div>}
      </div>
      <button ref={menu} className="bfs-menu-button" type="button" aria-label="Mở danh sách chương" onClick={() => dialog.current?.showModal()}><Menu size={20}/></button>
    </header>
    <div className="bfs-layout"><aside className="bfs-sidebar"><Link className="bfs-back" href="/"><ArrowLeft size={15}/>Về IdeaHub</Link><ChapterNav catalog={catalog} groups={groups} pathname={pathname}/><div className="bfs-sidebar-note">Đọc để hiểu<br/><strong>Làm để kiểm chứng</strong></div></aside><main className="bfs-main" id="startup-content" tabIndex={-1}>{children}</main></div>
    <dialog ref={dialog} className="bfs-nav-dialog" aria-labelledby="startup-menu-title" onClose={() => menu.current?.focus()} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}><div className="bfs-dialog-heading"><strong id="startup-menu-title">Nội dung khởi nghiệp</strong><button type="button" aria-label="Đóng danh sách chương" onClick={() => dialog.current?.close()}><X size={20}/></button></div><Link className="bfs-back" href="/" onClick={navigate}><ArrowLeft size={15}/>Về IdeaHub</Link><ChapterNav catalog={catalog} groups={groups} pathname={pathname} onNavigate={navigate}/></dialog>
  </div>;
}
