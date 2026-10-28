import assert from "node:assert/strict";
import { test } from "node:test";
import { RoomScrollActivity, restoreRoomScroll } from "../src/lib/room-scroll";

function pane(initial=400) {
  let offset=initial;const writes:number[]=[];
  return {writes,box:{get scrollTop(){return offset;},set scrollTop(value:number){writes.push(value);offset=value;},scrollHeight:2000,clientHeight:600}};
}
test("read-receipt renders never assign an unchanged or subpixel scroll position",()=>{
  const {box,writes}=pane();
  for(let i=0;i<100;i++)restoreRoomScroll(box,false,false,i%2?0:0.4);
  assert.deepEqual(writes,[]);
});
test("touch release does not release the momentum guard",()=>{
  const activity=new RoomScrollActivity(),{box,writes}=pane();
  activity.touchStart(0);assert.equal(activity.active(1000),true);
  activity.touchEnd(1000);
  for(const now of [1016,1032,1080,1150,1250,1400]){
    activity.scroll(now);
    restoreRoomScroll(box,activity.active(now),false,120);
    restoreRoomScroll(box,activity.active(now),true);
  }
  assert.deepEqual(writes,[]);
  assert.equal(activity.active(1599),true);assert.equal(activity.active(1601),false);
});
test("stationary readers retain their anchor when actual content is inserted above",()=>{
  const {box,writes}=pane();restoreRoomScroll(box,false,false,120);
  assert.deepEqual(writes,[520]);
});
test("oldest sorting follows new content only at rest, without repeated writes at bottom",()=>{
  const {box,writes}=pane();restoreRoomScroll(box,true,true);assert.deepEqual(writes,[]);
  restoreRoomScroll(box,false,true);restoreRoomScroll(box,false,true);
  assert.deepEqual(writes,[1400]);
});
