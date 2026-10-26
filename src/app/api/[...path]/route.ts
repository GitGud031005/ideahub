import {storageMode} from "@/server/container";
import {getDatabasePool} from "@/server/database";
import {prepareCollaboration} from "@/server/collaboration-schema";
import {after} from "next/server";
import {getRepository} from "@/server/container";
import {dispatchPendingPush} from "@/server/web-push";
import { handleApi } from "@/server/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  if(storageMode()==="postgres")await prepareCollaboration(getDatabasePool());
  const path=(await context.params).path,result=await handleApi(request,path);
  if(result.ok&&((request.method==="POST"&&path.includes("comments"))||path[0]==="notifications"||path[0]==="push"))after(async()=>{try{await dispatchPendingPush(getRepository());}catch{console.warn("Push deferred; inbox retained");}});return result;
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
