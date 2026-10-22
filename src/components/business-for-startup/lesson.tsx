import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Clock3, Lightbulb } from "lucide-react";
import type { ContentBlock, LessonMeta, StartupLesson } from "@/content/business-for-startup/types";
import { StartupFigure } from "./figures";
import { CopyTemplate, HeadingLink, LessonToc } from "./reading-tools";
const base = "/business-for-startup";
function Block({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case "paragraph": return <p>{block.text}</p>;
    case "list": return block.ordered ? <ol>{block.items.map(item => <li key={item}>{item}</li>)}</ol> : <ul>{block.items.map(item => <li key={item}>{item}</li>)}</ul>;
    case "table": return <div className="bfs-table-scroll" role="region" aria-label={block.caption ?? `Bảng ${block.columns[0]}`} tabIndex={0}><table>{block.caption && <caption>{block.caption}</caption>}<thead><tr>{block.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead><tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
    case "callout": return <aside className="bfs-callout"><span><Lightbulb size={17} aria-hidden="true"/>{block.label}</span><p>{block.text}</p></aside>;
    case "template": return <CopyTemplate title={block.title} text={block.text}/>;
    case "figure": return <figure className="bfs-figure"><StartupFigure name={block.name}/><figcaption>{block.caption}</figcaption></figure>;
  }
}
export function StartupLessonView({ lesson, catalog }: { lesson: StartupLesson; catalog: LessonMeta[] }) {
  const index = catalog.findIndex(l => l.slug === lesson.slug), meta = catalog[index], previous = catalog[index - 1], next = catalog[index + 1];
  return <div className="bfs-reader">
    <article className="bfs-article"><nav className="bfs-breadcrumb" aria-label="Bạn đang ở"><Link href={base}>Business for Startup</Link><span aria-hidden="true">/</span><span>{lesson.chapter === null ? "Tổng kết" : `Chương ${lesson.chapter}`}</span></nav>
      <header className="bfs-article-header"><div className="bfs-eyebrow">{lesson.chapter === null ? "TỔNG KẾT THỰC HÀNH" : `CHƯƠNG ${String(lesson.chapter).padStart(2, "0")}`}</div><h1>{lesson.title}</h1><p>{lesson.description}</p><div className="bfs-reading-meta"><span><Clock3 size={14}/>{meta.minutes} phút đọc</span><span>Tài liệu thực hành</span></div><div className="bfs-question"><span>Câu hỏi của bài</span><strong>{lesson.question}</strong></div></header>
      <LessonToc sections={lesson.sections.map(s => ({ id: s.id, title: s.title }))}/>
      <div className="bfs-article-body">{lesson.sections.map((s, i) => <section className="bfs-section" id={s.id} key={s.id}><div className="bfs-section-number">{String(i + 1).padStart(2, "0")}</div><h2>{s.title}<HeadingLink id={s.id} title={s.title}/></h2>{s.blocks.map((block, j) => <Block key={j} block={block}/>)}</section>)}</div>
      <section className="bfs-practice" id="thuc-hanh"><div className="bfs-eyebrow">ĐỌC XONG, THỬ LÀM</div><h2>Biến kiến thức thành đầu ra</h2><p className="bfs-practice-outcome">{lesson.outcome}</p><ul>{lesson.practice.map(item => <li key={item}><span className="bfs-empty-check" aria-hidden="true"/>{item}</li>)}</ul><div className="bfs-takeaways"><strong>Ba điều cần nhớ</strong>{lesson.takeaways.map(t => <p key={t}><Check size={15}/>{t}</p>)}</div><div className="bfs-proposal-connection"><span>Đưa vào proposal</span><strong>{lesson.proposal}</strong>{lesson.chapter !== null && <Link href={`${base}/proposal-va-quy-trinh`}>Xem cách ghép vào proposal<ArrowUpRight size={15}/></Link>}</div></section>
      <details className="bfs-sources"><summary>Nguồn và ghi chú biên soạn</summary><ul>{lesson.sources.map(source => <li key={source}>{source}</li>)}</ul><p>Biên soạn tiếng Việt từ tài liệu khóa học do người dùng cung cấp; chọn phần cốt lõi và bổ sung mẫu thực hành. Minh họa được dựng lại cho trang. Cập nhật nội dung: 22/10/2026.</p></details>
      <nav className="bfs-pagination" aria-label="Bài trước và bài sau"><Link href={previous ? `${base}/${previous.slug}` : base}><span><ArrowLeft size={14}/>{previous ? "Bài trước" : "Quay lại"}</span><strong>{previous?.title ?? "Tổng quan tài liệu"}</strong></Link>{next ? <Link href={`${base}/${next.slug}`}><span>Bài tiếp theo<ArrowRight size={14}/></span><strong>{next.title}</strong></Link> : <Link href={base}><span>Khép lại vòng đọc<ArrowUpRight size={14}/></span><strong>Chọn bước cần làm cho ý tưởng của bạn</strong></Link>}</nav>
    </article>
  </div>;
}
