import {timingSafeEqual} from "node:crypto";
import {getDatabasePool} from "./database";
import {getRepository} from "./container";
import {json} from "./http";
import {dispatchPendingPush} from "./web-push";
export async function handlePushCron(request:Request,secret?:()=>Promise<string|undefined>,dispatch=()=>dispatchPendingPush(getRepository())){const supplied=request.headers.get("authorization")?.replace(/^Bearer /,"");if(!supplied||supplied.length!==72)return json({error:{code:"AUTH_REQUIRED",message:"Yêu cầu không hợp lệ"}},401);const expected=await (secret??(async()=>(await getDatabasePool().query<{dispatch_token:string}>("SELECT dispatch_token FROM ideahub_private.push_keys WHERE singleton=true")).rows[0]?.dispatch_token))();if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return json({error:{code:"FORBIDDEN",message:"Yêu cầu không hợp lệ"}},403);await dispatch();return json({ok:true});}
