import { getGoogleOAuth, googleFlowCookie } from "@/server/google-oauth";
import { getAuthService } from "@/server/auth";
import { errorResponse } from "@/server/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  try{
    const ip=process.env.VERCEL?request.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim()||"unknown":"local";
    await getAuthService().limit(`google:start:${ip}`,30,3600);
    await getAuthService().limit("google:start:global",500,86400);
    const result=await getGoogleOAuth().start(new URL(request.url).searchParams.get("next"));
    return new Response(null,{status:303,headers:{Location:result.url,"Set-Cookie":googleFlowCookie(result.state),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
  }catch(error){return errorResponse(error);}
}
