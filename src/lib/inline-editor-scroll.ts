type Bounds={top:number;bottom:number};
/** Scroll the chat pane just enough to expose the active field and its send controls. */
export function inlineEditorScroll(pane:Bounds,field:Bounds,footer:Bounds,viewport:Bounds,scrollTop:number){
  const top=Math.max(pane.top,viewport.top)+8,bottom=Math.min(pane.bottom,viewport.bottom)-8;
  if(bottom<=top)return scrollTop;
  const targetBottom=Math.max(field.bottom,footer.bottom);
  const delta=targetBottom-field.top<=bottom-top
    ? field.top<top?field.top-top:targetBottom>bottom?targetBottom-bottom:0
    : field.top<top?field.top-top:field.bottom>bottom?field.bottom-bottom:0;
  return Math.max(0,scrollTop+delta);
}
