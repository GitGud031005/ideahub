import assert from "node:assert/strict";
import {test} from "node:test";
import {notificationSound} from "../src/lib/notification-sound";
test("sound waits for a page gesture and queues a distinct alert for each arrival",t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,"window"),starts:number[]=[],contexts:any[]=[];
 class Audio{state="suspended";currentTime=10;destination={};constructor(){contexts.push(this);}async resume(){this.state="running";}async close(){this.state="closed";}createOscillator(){return {frequency:{value:0},connect(){},start(time:number){starts.push(time);},stop(){}};}createGain(){return {connect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}};}}
 const page=Object.assign(new EventTarget(),{AudioContext:Audio});Object.defineProperty(globalThis,"window",{value:page,configurable:true});t.after(()=>{if(previous)Object.defineProperty(globalThis,"window",previous);else Reflect.deleteProperty(globalThis,"window");});
 const sound=notificationSound();sound.play();assert.equal(contexts.length,0,"No autoplay before a gesture");page.dispatchEvent(new Event("pointerdown"));for(let i=0;i<4;i++)sound.play();assert.equal(starts.length,8);assert.equal(new Set(starts).size,8);sound.close();assert.equal(contexts[0].state,"closed");page.dispatchEvent(new Event("pointerdown"));assert.equal(contexts.length,1);
});
