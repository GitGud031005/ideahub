import { getGoogleOAuth, googleFlowCookie } from "@/server/google-oauth";
import { AppError } from "@/server/errors";
import { getSessionToken,sessionCookie } from "@/server/session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
export async function GET(request:Request){
  const headers=new Headers({"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});
  headers.append("Set-Cookie",googleFlowCookie("",true));
  let location="https://ideahub-umber.vercel.app/?authError=google";
  try{
    const oauth=getGoogleOAuth();location=`${oauth.origin()}/?authError=google`;
    const result=await oauth.complete(request,getSessionToken(request));
    headers.append("Set-Cookie",sessionCookie(result.token));location=oauth.origin()+result.returnTo;
  }catch(error){if(error instanceof AppError&&error.code==="GOOGLE_CANCELLED")location=location.replace("authError=google","authError=cancelled");}
  headers.set("Location",location);return new Response(null,{status:303,headers});
}
