import assert from "node:assert/strict";
import {test} from "node:test";
import {isAppleMobile,pushSupport,type PushEnvironment} from "../src/lib/push-support";
const android:PushEnvironment={userAgent:"Mozilla/5.0 (Linux; Android 15)",platform:"Linux armv8l",maxTouchPoints:5,standalone:false,secure:true,serviceWorker:true,pushManager:true,notification:true};
test("iPhone and desktop-mode iPad show install guidance before notification APIs are available",()=>{
 const iphone={...android,userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)",platform:"iPhone",notification:false,pushManager:false};
 assert.equal(pushSupport(iphone),"install-ios");
 const ipad={...iphone,userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X)",platform:"MacIntel",maxTouchPoints:5};
 assert.equal(isAppleMobile(ipad),true);assert.equal(pushSupport(ipad),"install-ios");
 assert.equal(isAppleMobile({...ipad,maxTouchPoints:0}),false);
});
test("installed iOS and Android enable push only with every required capability",()=>{
 const installed={...android,userAgent:"iPhone",platform:"iPhone",standalone:true};
 assert.equal(pushSupport(installed),"available");assert.equal(pushSupport(android),"available");
 for(const key of ["secure","serviceWorker","pushManager","notification"] as const){
  assert.equal(pushSupport({...installed,[key]:false}),"unsupported");assert.equal(pushSupport({...android,[key]:false}),"unsupported");
 }
});
