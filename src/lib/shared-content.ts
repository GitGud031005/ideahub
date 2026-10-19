import type { Comment } from "./domain";
export const ATTACHMENT_MAX_BYTES=3*1024*1024;
export const ATTACHMENT_ACCEPT=".jpg,.jpeg,.png,.webp,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.zip";
export function fileSize(size:number){return size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(size/1024))} KB`;}
export function sharedLinks(text:string):string[]{
  const found=new Set<string>();
  for(const candidate of text.match(/https?:\/\/[^\s<>"']+/gi)??[])try{
    const value=candidate.replace(/[.,;:!?\)\]\}]+$/g,"");
    const url=new URL(value);if(["http:","https:"].includes(url.protocol)&&!url.username&&!url.password)found.add(url.href);
  }catch{}
  return [...found];
}
export function sharedContent(comments:Comment[]){
  const images: {comment:Comment;attachment:NonNullable<Comment["attachments"]>[number]}[]=[],files:typeof images=[],links:{comment:Comment;url:string}[]=[];
  for(const comment of [...comments].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))){
    for(const attachment of comment.attachments??[])(attachment.kind==="image"?images:files).push({comment,attachment});
    for(const url of sharedLinks(comment.text))links.push({comment,url});
  }
  return {images,files,links,pins:comments.filter(c=>c.pinnedAt).sort((a,b)=>Date.parse(b.pinnedAt!)-Date.parse(a.pinnedAt!))};
}
