import type {Attachment} from './domain';
export function attachmentPreview(a:Pick<Attachment,'kind'|'mime'|'name'>){
 if(a.kind==='image')return 'image';
 if(a.mime==='application/pdf'||/\.pdf$/i.test(a.name))return 'pdf';
 if(['text/plain','text/csv'].includes(a.mime)||/\.(txt|csv)$/i.test(a.name))return 'text';
 return 'unsupported';
}
export function attachmentDownloadUrl(url:string){
 if(url.startsWith('blob:'))return url;
 const [path,hash]=url.split('#',2);
 return `${path}${path.includes('?')?'&':'?'}download=1${hash?`#${hash}`:''}`;
}
/** Bound the canvas allocation on memory-constrained mobile browsers. */
export function previewCanvasSize(width:number,height:number,dpr:number){
 const ratio=Math.min(Math.max(1,dpr),2,Math.sqrt(4_000_000/(width*height)));
 return {width:Math.max(1,Math.floor(width*ratio)),height:Math.max(1,Math.floor(height*ratio)),ratio};
}
