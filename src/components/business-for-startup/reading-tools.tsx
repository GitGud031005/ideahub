"use client";
import { Check, ChevronDown, Copy, Link2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
export function CopyTemplate({ title, text }: { title: string; text: string }) {
  const [status, setStatus] = useState(""), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const content = useRef<HTMLPreElement>(null), label = useId();
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(text); setStatus("Đã sao chép"); }
    catch { const range = document.createRange(); if (content.current) { range.selectNodeContents(content.current); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); } setStatus("Đã chọn văn bản, dùng thao tác sao chép của thiết bị"); }
    timer.current = setTimeout(() => setStatus(""), 3500);
  }
  return <div className="bfs-template"><div className="bfs-template-heading"><strong id={label}>{title}</strong><button type="button" onClick={copy} aria-label={`Sao chép ${title}`}>{status === "Đã sao chép" ? <Check size={15}/> : <Copy size={15}/>}<span>{status === "Đã sao chép" ? "Đã sao chép" : "Sao chép"}</span></button></div><pre ref={content} aria-labelledby={label} tabIndex={0}>{text}</pre><span className="bfs-copy-status" role="status" aria-live="polite">{status}</span></div>;
}
export function HeadingLink({ id, title }: { id: string; title: string }) {
  return <a className="bfs-heading-link" href={`#${id}`} aria-label={`Liên kết tới ${title}`}><Link2 size={17} aria-hidden="true"/></a>;
}
export function LessonToc({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const nodes = sections.map(s => document.getElementById(s.id)).filter(node => node !== null);
      const before = nodes.filter(node => node.getBoundingClientRect().top < 180);
      setActive((before.at(-1) ?? nodes[0])?.id ?? "");
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); window.addEventListener("scroll", scroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", scroll); };
  }, [sections]);
  const links = <>{sections.map(s => <a href={`#${s.id}`} key={s.id} aria-current={active === s.id ? "location" : undefined} onClick={() => setActive(s.id)}>{s.title}</a>)}</>;
  return <><aside className="bfs-toc"><nav aria-label="Trong bài này"><p>Trong bài này</p>{links}<a className="bfs-toc-practice" href="#thuc-hanh">Thực hành & đầu ra</a></nav></aside><details className="bfs-toc-mobile"><summary>Trong bài này<ChevronDown size={16}/></summary><nav aria-label="Mục lục trong bài">{links}<a href="#thuc-hanh">Thực hành & đầu ra</a></nav></details></>;
}
