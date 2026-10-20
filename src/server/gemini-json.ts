import { createHash } from "node:crypto";
import { geminiModelOrder } from "@/lib/gemini-models";
import { AppError } from "./errors";

export interface GeminiSettings { key?:string; model?:string; fallbacks?:string }
const catalogs=new Map<string,{expires:number;ids:Set<string>}>();
async function boundedJson(response:Response){
  const reader=response.body?.getReader();if(!reader)throw new Error("Empty response");
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();throw new Error("Response too large");}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
/** One provider policy for recaps and tag suggestions, with server-only keys. */
export class GeminiJsonClient {
  constructor(private settings:GeminiSettings={key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_MODEL,fallbacks:process.env.GEMINI_FALLBACK_MODELS},private transport:typeof fetch=fetch){}
  configured(){return !!this.settings.key?.trim();}
  private async available(){
    const hash=createHash("sha256").update(this.settings.key!.trim()).digest("hex"),cached=catalogs.get(hash);
    if(cached&&cached.expires>Date.now())return cached.ids;
    try{
      const response=await this.transport("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",{headers:{"x-goog-api-key":this.settings.key!.trim()},signal:AbortSignal.timeout(5000)});
      if(response.status===401||response.status===403){await response.body?.cancel();throw new AppError(503,"AI_AUTH","Google chưa chấp nhận API key hoặc quyền truy cập của project");}
      if(!response.ok){await response.body?.cancel();return null;}
      const data=await boundedJson(response);if(!Array.isArray(data.models)||data.nextPageToken)return null;
      const ids=new Set<string>(data.models.filter((m:{supportedGenerationMethods?:string[]})=>m.supportedGenerationMethods?.includes("generateContent")).map((m:{name:string})=>m.name.replace(/^models\//,"")));
      if(catalogs.size>20)catalogs.clear();catalogs.set(hash,{expires:Date.now()+300000,ids});return ids;
    }catch(error){if(error instanceof AppError)throw error;return null;}
  }
  async generate<T>(request:{instructions:string;input:unknown;schema:unknown;parse:(value:unknown)=>T;maxOutputTokens?:number;timeoutMs?:number;attemptTimeoutMs?:number;fast?:boolean}){
    if(!this.configured())throw new AppError(503,"AI_NOT_CONFIGURED","Chức năng AI chưa được kết nối, bạn vẫn có thể tự chọn tags hoặc xem recap đã lưu");
    let ordered:string[];try{ordered=geminiModelOrder(this.settings.model,this.settings.fallbacks);}catch{throw new AppError(503,"AI_CONFIG","Model AI phải thuộc danh sách đã cấu hình cho IdeaHub");}
    const deadline=Date.now()+(request.timeoutMs??45000),available=await this.available(),models=available?ordered.filter(id=>available.has(id)):ordered;
    if(!models.length)throw new AppError(503,"AI_NO_MODEL","Key Google hiện chưa truy cập được model nào trong danh sách IdeaHub");
    let last=new AppError(502,"AI_UNAVAILABLE","Chưa nhận được kết quả từ Google, hãy thử lại sau");
    for(const model of models.slice(0,8)){
      const remaining=deadline-Date.now();if(remaining<1500)break;
      let response:Response;
      try{response=await this.transport(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":this.settings.key!.trim()},signal:AbortSignal.timeout(Math.min(request.attemptTimeoutMs??25000,remaining)),
        body:JSON.stringify({systemInstruction:{parts:[{text:request.instructions}]},contents:[{role:"user",parts:[{text:JSON.stringify(request.input)}]}],generationConfig:{responseMimeType:"application/json",responseSchema:request.schema,maxOutputTokens:request.maxOutputTokens??8000,...(request.fast&&model.startsWith("gemini-3")?{thinkingConfig:{thinkingLevel:"low"}}:request.fast&&model.startsWith("gemini-2.5")?{thinkingConfig:{thinkingBudget:model.includes("pro")?128:0}}:{})}}),
      });}catch(error){
        const cause=(error as {cause?:{code?:string}})?.cause?.code;
        const timeout=(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name))||cause?.includes("TIMEOUT");
        const known=["UND_ERR_CONNECT_TIMEOUT","ENOTFOUND","ECONNRESET","ECONNREFUSED","ETIMEDOUT","EAI_AGAIN","UNABLE_TO_VERIFY_LEAF_SIGNATURE"];
        const code=timeout?"AI_TIMEOUT":`AI_CONNECTION_${cause&&known.includes(cause)?cause:"FAILED"}`;
        last=new AppError(timeout?504:502,code,timeout?"Google đang phản hồi chậm, hãy thử lại sau":"Chưa kết nối được với Google, hãy thử lại sau");
        console.warn("IdeaHub Gemini transport unavailable",{model,code});continue;
      }
      if(!response.ok){
        const status=response.status;
        if(status===400){
          const data=await boundedJson(response).catch(()=>null),detail=data?.error;
          const reasons=Array.isArray(detail?.details)?detail.details.map((d:{reason?:string})=>d.reason):[];
          if(reasons.some((r:string)=>["API_KEY_INVALID","API_KEY_EXPIRED","API_KEY_SERVICE_BLOCKED"].includes(r)))throw new AppError(503,"AI_AUTH","Google chưa chấp nhận API key hoặc quyền truy cập của project");
          if(detail?.status==="FAILED_PRECONDITION")throw new AppError(503,"AI_PROJECT_SETUP","Project Google chưa đáp ứng điều kiện sử dụng model AI");
          const message=typeof detail?.message==="string"?detail.message:"";
          const issue=/thinking/i.test(message)?"THINKING":/schema|enum|states|constraint/i.test(message)?"SCHEMA":/location|country|region/i.test(message)?"REGION":"UNKNOWN";
          throw new AppError(502,`AI_REQUEST_${issue}`,"Google chưa chấp nhận cấu hình yêu cầu AI");
        }
        await response.body?.cancel();
        if(status===401||status===403)throw new AppError(503,"AI_AUTH","Google chưa chấp nhận API key hoặc quyền truy cập của project");
        if(status===404||status===429||status>=500){last=new AppError(status===429?429:502,"AI_UNAVAILABLE",status===429?"Các model Google đang giới hạn lượt gọi, hãy thử lại sau":"Chưa nhận được kết quả với các model dự phòng");continue;}
        throw new AppError(502,"AI_REQUEST_CONFIG","Google chưa chấp nhận cấu hình yêu cầu AI");
      }
      try{
        const result=await boundedJson(response),candidate=result.candidates?.[0];
        if(result.promptFeedback?.blockReason||["SAFETY","RECITATION","PROHIBITED_CONTENT","BLOCKLIST"].includes(candidate?.finishReason))throw new AppError(422,"AI_BLOCKED","Google chưa thể xử lý nội dung này");
        if(candidate?.finishReason!=="STOP")throw new Error("Incomplete output");
        const text=candidate.content.parts.filter((p:{text?:string;thought?:boolean})=>typeof p.text==="string"&&!p.thought).map((p:{text:string})=>p.text).join("");
        return {content:request.parse(JSON.parse(text)),model};
      }catch(error){if(error instanceof AppError)throw error;last=new AppError(502,"AI_INVALID_RESPONSE","AI trả về nội dung chưa hợp lệ, hãy thử lại");}
    }
    throw last;
  }
}
