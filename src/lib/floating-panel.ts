export interface PanelAnchor {left:number;right:number;top:number;bottom:number;width:number}
export interface PanelViewport {left:number;top:number;width:number;height:number}
/** Place a popup inside the visible viewport, including a panned software-keyboard viewport. */
export function floatingPanel(anchor:PanelAnchor,viewport:PanelViewport,{width,height,preferAbove=false}:{width:number;height:number;preferAbove?:boolean}){
 const padding=12,gap=8,leftEdge=viewport.left+padding,rightEdge=viewport.left+viewport.width-padding,topEdge=viewport.top+padding,bottomEdge=viewport.top+viewport.height-padding;
 const panelWidth=Math.max(0,Math.min(width,rightEdge-leftEdge)),above=Math.max(0,anchor.top-gap-topEdge),below=Math.max(0,bottomEdge-anchor.bottom-gap);
 const up=preferAbove?above>=Math.min(height,100)||above>below:below<height&&above>below;
 const maxHeight=Math.max(0,Math.min(height,up?above:below));
 return {left:Math.max(leftEdge,Math.min(anchor.left,rightEdge-panelWidth)),top:Math.max(topEdge,Math.min(up?anchor.top-gap-maxHeight:anchor.bottom+gap,bottomEdge-maxHeight)),width:panelWidth,maxHeight};
}
