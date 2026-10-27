import type {Author,Comment,Mention,RoomNotification} from "@/lib/domain";
import {validMentions} from "@/lib/mentions";
import {AppError} from "./errors";
export function checkMentions(text:string,mentions:Mention[]=[],members:readonly Author[]){const valid=validMentions(text,mentions);if(valid.length!==mentions.length||valid.some(m=>!members.some(u=>u.id===m.userId)))throw new AppError(422,"INVALID_MENTION","Chọn người được nhắc từ danh sách thành viên của phòng");return valid;}
/** New comments notify every other current member; edits only process newly added mentions. */
export function notificationRecipients(comment:Comment,parent:Comment|undefined,oldMentions:readonly Mention[]|undefined=undefined,memberIds:readonly string[]=[]){
 const recipients=new Map<string,RoomNotification["kind"]>();
 if(oldMentions===undefined){
  for(const id of memberIds)if(id!==comment.author.id)recipients.set(id,"message");
  if(parent&&parent.author.id!==comment.author.id)recipients.set(parent.author.id,"reply");
 }
 const old=new Set((oldMentions??[]).map(m=>m.userId));
 for(const m of comment.mentions??[])if(m.userId!==comment.author.id&&!old.has(m.userId))recipients.set(m.userId,"mention");
 return recipients;
}
export type StoredNotification=RoomNotification & {pushState?:"pending"|"sent";pushAfter?:number;attempts?:number};
