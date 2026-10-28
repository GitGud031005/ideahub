/** The room must actually be on screen, unobscured and owned by this account. */
export function activeRoom(ideaId:string,userId:string) {
  if(document.hidden||document.querySelector("dialog[open]"))return null;
  const pane=document.querySelector<HTMLElement>(".ih-thread-comments");
  return pane?.dataset.ideaId===ideaId&&pane.dataset.userId===userId&&!pane.closest("[inert]")?pane:null;
}
export function roomCommentVisible(ideaId:string,commentId:string,userId:string) {
  const pane=activeRoom(ideaId,userId),el=document.getElementById(`comment-${commentId}`);
  if(!pane||!el||!pane.contains(el)||!el.getClientRects().length)return false;
  const a=el.getBoundingClientRect(),b=pane.getBoundingClientRect();
  return a.height>0&&b.height>0&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>=Math.min(a.height, b.height)*0.1;
}
export function roomBranchVisible(ideaId:string,parentId:string,userId:string) {
  if(roomCommentVisible(ideaId,parentId,userId))return true;
  const pane=activeRoom(ideaId,userId),branch=document.getElementById(`children-${parentId}`);
  if(!pane||!branch||!pane.contains(branch)||!branch.getClientRects().length)return false;
  const a=branch.getBoundingClientRect(),b=pane.getBoundingClientRect();
  return a.height>0&&a.bottom>b.top&&a.top<b.bottom;
}
/** Inbox and comment streams can arrive in either order. Give the room a chance to render. */
export async function waitForVisibleComment(ideaId:string,commentId:string,userId:string) {
  const until=Date.now()+1600;
  do {
    if(roomCommentVisible(ideaId,commentId,userId))return true;
    if(!activeRoom(ideaId,userId)||Date.now()>=until)return false;
    await new Promise(resolve=>setTimeout(resolve,100));
  } while(true);
}
