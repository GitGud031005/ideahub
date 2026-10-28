import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { watchComments, watchNotifications } from "../src/lib/comment-live";

function browser(t: TestContext) {
  const page = Object.assign(new EventTarget(), { hidden: false });
  const windowEvents = new EventTarget(), network = { onLine: true };
  class Source extends EventTarget {
    static instances: Source[] = [];
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) { super(); Source.instances.push(this); }
    close() { this.closed = true; }
  }
  for (const [key, value] of Object.entries({ document: page, window: windowEvents, navigator: network, EventSource: Source })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key); });
  }
  return { page, windowEvents, network, Source };
}

test("live client receives updates, falls back on errors, and reconnects after hiding/offline", t => {
  const { page, windowEvents, network, Source } = browser(t);
  let changes = 0, connected = false;
  const stop = watchComments("room 1", { changed: () => { changes++; }, connected: value => { connected = value; }, expired: () => assert.fail("unexpected expiry") });
  const first = Source.instances[0];
  assert.equal(first.url, "/api/ideas/room%201/comments/stream");
  first.onopen!(); assert.equal(connected, true);
  first.dispatchEvent(new Event("comments-changed")); assert.equal(changes, 1);
  first.onerror!(); assert.equal(connected, false);
  first.onopen!(); assert.equal(connected, true);
  page.hidden = true; page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(first.closed, true); assert.equal(connected, false);
  first.dispatchEvent(new Event("comments-changed")); assert.equal(changes, 1);
  page.hidden = false; page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(Source.instances.length, 2);
  windowEvents.dispatchEvent(new Event("online")); assert.equal(Source.instances.length, 2);
  network.onLine = false; windowEvents.dispatchEvent(new Event("offline"));
  assert.equal(Source.instances[1].closed, true);
  network.onLine = true; windowEvents.dispatchEvent(new Event("online"));
  assert.equal(Source.instances.length, 3);
  stop(); assert.equal(Source.instances[2].closed, true);
  page.dispatchEvent(new Event("visibilitychange")); windowEvents.dispatchEvent(new Event("online"));
  assert.equal(Source.instances.length, 3);
});

test("expired sessions close the source and cannot reconnect; unmount ignores late events", t => {
  const { page, Source } = browser(t);
  let expired = 0, changes = 0;
  const stop = watchComments("1", { changed: () => { changes++; }, connected: () => {}, expired: () => { expired++; } });
  const source = Source.instances[0];
  source.dispatchEvent(new Event("auth-required"));
  assert.equal(expired, 1); assert.equal(source.closed, true);
  page.dispatchEvent(new Event("visibilitychange")); assert.equal(Source.instances.length, 1);
  stop(); source.dispatchEvent(new Event("comments-changed")); assert.equal(changes, 0);
});

test("unsupported browsers and initially hidden pages keep HTTP fallback available", t => {
  const { page, Source } = browser(t);
  page.hidden = true;
  let connected = false;
  const callbacks = { changed: () => {}, connected: (value: boolean) => { connected = value; }, expired: () => {} };
  const stop = watchComments("1", callbacks);
  assert.equal(Source.instances.length, 0); assert.equal(connected, false);
  stop();
  Object.defineProperty(globalThis, "EventSource", { value: undefined, configurable: true });
  page.hidden = false;
  const unsupported = watchComments("1", callbacks);
  assert.equal(Source.instances.length, 0); assert.equal(connected, false);
  unsupported();
});

test("inbox connects independently of the current room and reconnects after returning to the app",t=>{
 const {page,Source}=browser(t);let changed=0,expired=0;const stop=watchNotifications({changed:()=>changed++,connected:()=>{},expired:()=>expired++});
 assert.equal(Source.instances[0].url,"/api/notifications/stream");Source.instances[0].dispatchEvent(new Event("notifications-changed"));assert.equal(changed,1);
 page.hidden=true;page.dispatchEvent(new Event("visibilitychange"));assert(Source.instances[0].closed);
 page.hidden=false;page.dispatchEvent(new Event("visibilitychange"));assert.equal(Source.instances.length,2);
 Source.instances[1].dispatchEvent(new Event("auth-required"));assert.equal(expired,1);assert(Source.instances[1].closed);stop();
});
