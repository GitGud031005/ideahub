import type {ReactNode} from "react";
import type {Mention} from "@/lib/domain";
import {validMentions} from "@/lib/mentions";
import {sharedLinks} from "@/lib/shared-content";
function links(text:string,key:string):ReactNode{return text.split(/(https?:\/\/[^\s<>"']+)/gi).map((part,i)=>sharedLinks(part).length===1&&/^https?:\/\//i.test(part)?<a key={`${key}:${i}`} href={sharedLinks(part)[0]} target="_blank" rel="noopener noreferrer">{part}</a>:part);}
export function CommentText({text,mentions=[]}:{text:string;mentions?:Mention[]}){const parts:ReactNode[]=[];let cursor=0;for(const m of validMentions(text,mentions)){parts.push(<span key={`text:${cursor}`}>{links(text.slice(cursor,m.start),String(cursor))}</span>);parts.push(<strong className="ih-mention" key={`mention:${m.start}`} data-user-id={m.userId}>{text.slice(m.start,m.end)}</strong>);cursor=m.end;}parts.push(<span key={`text:${cursor}`}>{links(text.slice(cursor),String(cursor))}</span>);return <>{parts}</>;}
