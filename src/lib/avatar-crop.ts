export interface AvatarPan { x:number; y:number }
export function avatarCrop(width:number,height:number,zoom:number,pan:AvatarPan) {
  if(![width,height,zoom,pan.x,pan.y].every(Number.isFinite)||width<=0||height<=0||zoom<1||zoom>4)throw new Error("Vùng cắt ảnh không hợp lệ");
  const side=Math.min(width,height)/zoom;
  const clamp=(n:number)=>Math.min(1,Math.max(-1,n));
  return {x:(width-side)*(1-clamp(pan.x))/2,y:(height-side)*(1-clamp(pan.y))/2,side};
}
