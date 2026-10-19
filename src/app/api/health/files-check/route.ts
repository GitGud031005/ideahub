import { CloudinaryDiscussionFiles } from "@/server/discussion-uploads";
import { json,rateLimit,errorResponse } from "@/server/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
let check:Promise<unknown>|undefined;
export async function GET(){
  if(Date.now()>Date.parse("2026-10-19T17:00:00Z"))return json({error:"Diagnostic expired"},404);
  try{rateLimit("files:isolated-probe",1);return json(await (check??=new CloudinaryDiscussionFiles().verifySyntheticFile()));}
  catch(e){return errorResponse(e);}
}
