"use client";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, SearchX, X, ArrowUpRight, RefreshCw, AlertCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import type { Author, CommentsPage } from "@/lib/domain";
import { normalize, relativeTime } from "@/lib/format";
import { Select } from "./select";
import { Avatar } from "./avatar";

function Excerpt({ text, q }: { text: string; q: string }) {
  const needle=normalize(q),position=normalize(text).indexOf(needle),starts:number[]=[],ends:number[]=[];
  let cursor=0;
  for(const character of text){for(let n=0;n<normalize(character).length;n++){starts.push(cursor);ends.push(cursor+character.length);}cursor+=character.length;}
  const matchStart=starts[position]??0,matchEnd=ends[position+needle.length-1]??matchStart;
  const start=Math.max(0,matchStart-48),end=Math.min(text.length,Math.max(matchEnd+110,start+170));
  return <span className="ih-search-excerpt">{start>0&&"…"}{q&&position>=0?<>{text.slice(start,matchStart)}<mark>{text.slice(matchStart,matchEnd)}</mark>{text.slice(matchEnd,end)}</>:text.slice(0,170)}{end<text.length&&"…"}</span>;
}
export function RoomSearch({ideaId,members,onReveal,onClose}:{ideaId:string;members:Author[];onReveal:(id:string)=>void;onClose:()=>void}) {
  const [input,setInput]=useState(""),[q,setQ]=useState(""),[author,setAuthor]=useState(""),[selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>setQ(input.trim()),250);return()=>clearTimeout(timer);},[input]);
  const results=useInfiniteQuery({queryKey:["room-search",ideaId,q,author],initialPageParam:"0",enabled:!!q||!!author,queryFn:({signal,pageParam})=>api<CommentsPage>(`/ideas/${encodeURIComponent(ideaId)}/search?${new URLSearchParams({q,author,offset:pageParam})}`,{signal}),getNextPageParam:last=>last.nextCursor??undefined,staleTime:0,refetchInterval:15000});
  const filtering=!!q||!!author,items=results.data?.pages.flatMap(p=>p.items)??[];
  return <div className="ih-room-search">
    <div className="ih-about-top"><span className="ih-about-label">TÌM TRONG PHÒNG</span><button type="button" className="ih-about-close" aria-label="Đóng tìm kiếm" onClick={onClose}><X size={16}/></button></div>
    <label className="ih-room-search-field"><Search size={16} aria-hidden="true"/><input autoFocus aria-label="Nội dung cần tìm" placeholder="Tìm một bình luận…" maxLength={120} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(input)setInput("");else onClose();}}}/>{input&&<button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={()=>setInput("")}><X size={14}/></button>}</label>
    <div className="ih-search-filter"><span>Người gửi</span><Select wide label="Lọc người gửi" value={author} onChange={setAuthor} options={[{value:"",label:"Tất cả thành viên"},...members.map(u=>({value:u.id,label:members.filter(m=>m.name===u.name).length>1?`${u.name} (${members.filter(m=>m.name===u.name).findIndex(m=>m.id===u.id)+1})`:u.name}))]}/></div>
    {!filtering?<div className="ih-collaboration-state ih-search-intro"><span className="ih-state-icon"><Search size={22}/></span><strong>Tìm lại một góc nhìn</strong><p>Tìm nội dung hoặc chọn người gửi, kể cả trong những nhánh đang thu gọn</p></div>:
     results.isPending?<div className="ih-search-loading" role="status"><span className="ih-sr">Đang tìm bình luận</span>{[0,1,2].map(n=><div key={n} className="ih-notification-skeleton"><i/><span><b/><em/></span></div>)}</div>:
     results.error&&!items.length?<div className="ih-collaboration-state" role="alert"><span className="ih-state-icon"><AlertCircle size={22}/></span><strong>Chưa tìm kiếm được</strong><p>{results.error.message}</p><button type="button" className="ih-quiet-action" onClick={()=>void results.refetch()}><RefreshCw size={13}/>Thử lại</button></div>:
     !items.length?<div className="ih-collaboration-state"><span className="ih-state-icon"><SearchX size={22}/></span><strong>Không tìm thấy bình luận</strong><p>Thử từ khóa ngắn hơn hoặc đổi người gửi</p><button type="button" className="ih-quiet-action" onClick={()=>{setInput("");setAuthor("");}}>Xóa bộ lọc</button></div>:<>
      <div className="ih-search-results-meta"><span role="status">{results.data?.pages[0].total??0} kết quả</span><button type="button" onClick={()=>{setInput("");setAuthor("");}}>Xóa bộ lọc</button></div>
      <div className="ih-room-search-results">{items.map(c=><button type="button" key={c.id} className={`ih-room-search-result${selected===c.id?" ih-room-search-selected":""}`} aria-current={selected===c.id?"true":undefined} onClick={()=>{setSelected(c.id);onReveal(c.id);}}><span className="ih-search-result-byline"><Avatar person={c.author}/><strong>{c.author.name}</strong><ArrowUpRight size={13} aria-hidden="true"/></span><Excerpt text={c.text||"Tệp đính kèm"} q={q}/><span className="ih-search-result-footer"><time dateTime={c.createdAt}>{relativeTime(c.createdAt)}</time>{c.parentId&&<span>Trong nhánh trả lời</span>}</span></button>)}</div>
      {results.hasNextPage&&<button type="button" className="ih-search-more ih-quiet-action" disabled={results.isFetchingNextPage} onClick={()=>void results.fetchNextPage()}>{results.isFetchingNextPage?"Đang tải…":"Xem thêm kết quả"}</button>}
    </>}
  </div>;
}
