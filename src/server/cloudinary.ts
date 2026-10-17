import { createHash } from "node:crypto";
import { AppError } from "./errors";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export function isGooglePicture(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !u.port && (u.hostname === "googleusercontent.com" || u.hostname.endsWith(".googleusercontent.com")); } catch { return false; }
}
export function imageMime(bytes: Uint8Array) {
  if (bytes.length > 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length > 12 && Buffer.from(bytes.subarray(0,4)).toString() === "RIFF" && Buffer.from(bytes.subarray(8,12)).toString() === "WEBP") return "image/webp";
  throw new AppError(422, "AVATAR_TYPE", "Chọn ảnh JPG, PNG hoặc WebP hợp lệ");
}
export async function readAvatar(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new AppError(415,"CONTENT_TYPE","Ảnh cần gửi dạng multipart/form-data");
  const reader = request.body?.getReader(); if (!reader) throw new AppError(422,"AVATAR_EMPTY","Chọn một ảnh đại diện");
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > AVATAR_MAX_BYTES + 65536) { await reader.cancel(); throw new AppError(413,"AVATAR_SIZE","Ảnh tối đa 2 MB"); } chunks.push(value); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks),{ headers:{"content-type":request.headers.get("content-type")!} }).formData(); } catch { throw new AppError(400,"AVATAR_INVALID","Nội dung ảnh chưa hợp lệ"); }
  const files = form.getAll("avatar");
  if (files.length !== 1 || [...form.keys()].some(k => k !== "avatar") || !(files[0] instanceof File)) throw new AppError(422,"AVATAR_EMPTY","Chọn đúng một ảnh đại diện");
  const file = files[0]; if (!file.size || file.size > AVATAR_MAX_BYTES) throw new AppError(413,"AVATAR_SIZE","Ảnh tối đa 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = imageMime(bytes);
  return new Blob([bytes],{type:mime});
}
export class CloudinaryAvatars {
  constructor(private config:{cloud?:string;key?:string;secret?:string} = { cloud:process.env.CLOUDINARY_CLOUD_NAME,key:process.env.CLOUDINARY_API_KEY,secret:process.env.CLOUDINARY_API_SECRET },private transport:typeof fetch = fetch) {}
  configured() { return !!(this.config.cloud && /^[a-zA-Z0-9_-]+$/.test(this.config.cloud) && this.config.key && this.config.secret); }
  async upload(userId: string, image: Blob | string) {
    if (!this.configured()) throw new AppError(503,"AVATAR_CONFIG","Chức năng ảnh đại diện chưa kết nối Cloudinary");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(userId) || (typeof image === "string" && !isGooglePicture(image))) throw new AppError(422,"AVATAR_INVALID","Nguồn ảnh chưa hợp lệ");
    const fields:Record<string,string> = { public_id:`ideahub/avatars/${userId}`,timestamp:String(Math.floor(Date.now()/1000)),overwrite:"true",invalidate:"true",transformation:"c_fill,g_auto,h_512,w_512/f_webp,q_auto" };
    const signature = createHash("sha256").update(Object.keys(fields).sort().map(k=>`${k}=${fields[k]}`).join("&")+this.config.secret).digest("hex");
    const body=new FormData(); for(const [key,value] of Object.entries(fields)) body.set(key,value);
    body.set("signature",signature);body.set("api_key",this.config.key!); if(typeof image === "string") body.set("file",image);else body.set("file",image,"avatar");
    try {
      const response=await this.transport(`https://api.cloudinary.com/v1_1/${this.config.cloud}/image/upload`,{method:"POST",body,signal:AbortSignal.timeout(20000)});
      if(!response.ok){await response.body?.cancel();throw new Error("Upload rejected");}
      const result=await response.json();const url=new URL(result.secure_url);
      if(url.protocol!=="https:"||url.hostname!=="res.cloudinary.com"||!url.pathname.startsWith(`/${this.config.cloud}/image/upload/`)||result.public_id!==fields.public_id)throw new Error("Invalid upload result");
      return url.toString();
    } catch {throw new AppError(502,"AVATAR_UPLOAD","Chưa tải được ảnh lên Cloudinary, hãy thử lại");}
  }
}
