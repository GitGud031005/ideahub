import assert from "node:assert/strict";
import {test} from "node:test";
import {floatingPanel} from "../src/lib/floating-panel";
test("popup stays in the visible area across phone widths and keyboard pan offsets",()=>{
 for(const width of [320,360,375,390,412,430,844])for(const height of [280,390,480,667,844])for(const top of [0,90])for(const y of [top+40,top+height/2,top+height-50]){
  const viewport={left:0,top,width,height},anchor={left:width-80,right:width-12,width:68,top:y,bottom:y+40};
  const panel=floatingPanel(anchor,viewport,{width:320,height:280,preferAbove:true});
  assert(panel.left>=12);assert(panel.left+panel.width<=width-12);assert(panel.top>=top+12);assert(panel.top+panel.maxHeight<=top+height-12);assert(panel.maxHeight>=0);
 }
});
test("multiline composer suggestions open above and menus near the top open below",()=>{
 const viewport={left:0,top:0,width:390,height:480};
 const composer=floatingPanel({left:10,right:380,width:370,top:250,bottom:410},viewport,{width:320,height:180,preferAbove:true});
 assert(composer.top+composer.maxHeight<=242);
 const sort=floatingPanel({left:280,right:324,width:44,top:10,bottom:54},viewport,{width:184,height:100});
 assert.equal(sort.top,62);assert(sort.left+sort.width<=378);
});
