import type { Attachment } from "@/lib/domain";
export interface StoredAttachment extends Attachment { ideaId:string; ownerId:string; assetId:string; commentId:string|null; createdAt:string }
export function publicAttachment(a:StoredAttachment):Attachment {return {id:a.id,name:a.name,mime:a.mime,size:a.size,kind:a.kind,url:a.url};}
