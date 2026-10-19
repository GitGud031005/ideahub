import { createHash, randomUUID } from "node:crypto";
import { ATTACHMENT_MAX_BYTES } from "@/lib/shared-content";
import { AppError } from "./errors";
import { imageMime } from "./cloudinary";
import type { StoredAttachment } from "./attachment-record";

export async function readDiscussionFile(request:Request){
  const type=request.headers.get("content-type");
  if(!type?.startsWith("multipart/form-data;"))throw new AppError(415,"CONTENT_TYPE","Gửi tệp dạng multipart/form-data");
  const reader=request.body?.getReader();if(!reader)throw new AppError(422,"FILE_EMPTY","Chọn một tệp");
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>ATTACHMENT_MAX_BYTES+65536){await reader.cancel();throw new AppError(413,"FILE_SIZE","Mỗi tệp tối đa 3 MB");}chunks.push(value);}
  let form:FormData;try{form=await new Response(Buffer.concat(chunks),{headers:{"content-type":type}}).formData();}catch{throw new AppError(422,"FILE_INVALID","Tệp chưa hợp lệ");}
  const entries=form.getAll("file");if(entries.length!==1||!(entries[0] instanceof File)||[...form.keys()].some(k=>k!=="file"))throw new AppError(422,"FILE_EMPTY","Mỗi lượt tải một tệp");
  const file=entries[0];if(!file.size||file.size>ATTACHMENT_MAX_BYTES)throw new AppError(413,"FILE_SIZE","Mỗi tệp tối đa 3 MB");
  const bytes=new Uint8Array(await file.arrayBuffer()),name=file.name.split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f\x7f]/g,"").trim().slice(0,180)||"tep";
  const ext=name.split('.').at(-1)!.toLowerCase();let mime="",kind:"image"|"file"="file";
  if(["jpg","jpeg","png","webp"].includes(ext)){
    try{mime=imageMime(bytes);}catch{throw new AppError(422,"FILE_TYPE","Ảnh JPG, PNG hoặc WebP chưa hợp lệ");}kind="image";
  }else if(ext==="pdf"&&Buffer.from(bytes.subarray(0,5)).toString()==="%PDF-")mime="application/pdf";
  else if(["docx","xlsx","pptx","zip"].includes(ext)&&bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4)mime="application/octet-stream";
  else if(["txt","csv"].includes(ext)){
    try{new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(bytes.includes(0))throw Error();}catch{throw new AppError(422,"FILE_TYPE","Tệp văn bản cần dùng UTF-8");}mime=ext==="csv"?"text/csv":"text/plain";
  }else throw new AppError(422,"FILE_TYPE","Hỗ trợ JPG, PNG, WebP, PDF, TXT, CSV, DOCX, XLSX, PPTX và ZIP");
  return {name,mime,size:file.size,kind,blob:new Blob([bytes],{type:mime})};
}

/** Keep discussion assets authenticated; proxy bytes only after app session authorization. */
export class CloudinaryDiscussionFiles {
  constructor(private config={cloud:process.env.CLOUDINARY_CLOUD_NAME,key:process.env.CLOUDINARY_API_KEY,secret:process.env.CLOUDINARY_API_SECRET},private transport:typeof fetch=fetch){}
  configured(){return !!(this.config.cloud&&/^[a-zA-Z0-9_-]+$/.test(this.config.cloud)&&this.config.key&&this.config.secret);}
  private signature(fields:Record<string,string>){return createHash("sha256").update(Object.keys(fields).sort().map(k=>`${k}=${fields[k]}`).join('&')+this.config.secret).digest("hex");}
  async upload(file:Awaited<ReturnType<typeof readDiscussionFile>>){return (await this.uploadStored(file)).assetId;}
  private async uploadStored(file:Awaited<ReturnType<typeof readDiscussionFile>>){
    if(!this.configured())throw new AppError(503,"FILE_CONFIG","Chưa kết nối nơi lưu tệp");
    const fields={public_id:`ideahub/discussions/${randomUUID()}.${file.name.split('.').at(-1)!.toLowerCase()}`,timestamp:String(Math.floor(Date.now()/1000)),type:"authenticated",overwrite:"false"};
    const body=new FormData();for(const [k,v] of Object.entries(fields))body.set(k,v);
    body.set("api_key",this.config.key!);body.set("signature",this.signature(fields));body.set("file",file.blob,file.name);
    try{
      const response=await this.transport(`https://api.cloudinary.com/v1_1/${this.config.cloud}/raw/upload`,{method:"POST",body,redirect:"error",signal:AbortSignal.timeout(25000)});
      if(!response.ok){await response.body?.cancel();throw Error();}
      const data=await response.json();
      if(data.public_id!==fields.public_id||data.resource_type!=="raw"||data.type!=="authenticated"||typeof data.asset_id!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.asset_id))throw Error();
      return {assetId:data.asset_id as string,publicId:fields.public_id};
    }catch{throw new AppError(502,"FILE_UPLOAD","Chưa tải được tệp, hãy thử gửi lại");}
  }
  async download(a:StoredAttachment,attachment:boolean){
    if(!this.configured())throw new AppError(503,"FILE_CONFIG","Chưa kết nối nơi lưu tệp");
    const fields={asset_id:a.assetId,timestamp:String(Math.floor(Date.now()/1000)),expires_at:String(Math.floor(Date.now()/1000)+60),attachment:attachment?"true":"false"};
    const params=new URLSearchParams({...fields,api_key:this.config.key!,signature:this.signature(fields)});
    try{
      const r=await this.transport(`https://api.cloudinary.com/v1_1/${this.config.cloud}/asset/download?${params}`,{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
      if(!r.ok){await r.body?.cancel();throw Error();}
      return new Response(r.body,{headers:{"Content-Type":a.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox","Content-Disposition":`${a.kind==="image"&&!attachment?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(a.name)}`}});
    }catch{throw new AppError(502,"FILE_DOWNLOAD","Chưa mở được tệp, hãy thử lại");}
  }
}
