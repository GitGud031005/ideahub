import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { decodeJwt, SignJWT } from "jose";
import type { Account } from "../src/lib/domain";
import { MEETING_CAPACITY, MEETING_CLOSE_LEAD_MS, MEETING_DURATION_MS, MEETING_GRACE_MS, MEETING_WARNING_MS, meetingClock } from "../src/lib/meeting";
import { LiveKitMeetingProvider, type MeetingProvider } from "../src/server/meetings/provider";
import { MeetingService } from "../src/server/meetings/service";
import { MeetingStore } from "../src/server/meetings/store";
import { PostgresIdeaRepository } from "../src/server/postgres-repository";
import { embeddedPool } from "./helpers/postgres";

const accounts: Account[] = Array.from({ length: 8 }, (_, index) => ({
  id: `member-${index}`, name: `Member ${index}`, username: `member${index}`, initial: "M",
}));
const [host, guest, outsider] = accounts;
const input = { title: "Họp thử", description: "Thử vòng đời cuộc họp", category: "Khác", tags: [] } as const;
type FakeRoom = { sid: string; identities: Set<string>; emptyAt: number | null };

class FakeProvider implements MeetingProvider {
  rooms = new Map<string, FakeRoom>();
  created = 0;
  failCreateAfterWrite = false;
  failTerminate = false;
  revoked = new Map<string, Set<string>>();

  constructor(private now: () => number) {}

  private lookup(name: string) {
    const room = this.rooms.get(name);
    if (room && room.emptyAt !== null && this.now() >= room.emptyAt + MEETING_GRACE_MS) {
      this.rooms.delete(name);
      return undefined;
    }
    return room;
  }

  async inspect(name: string) {
    const room = this.lookup(name);
    return room ? { sid: room.sid, count: room.identities.size } : null;
  }

  async create(name: string) {
    assert(!this.rooms.has(name));
    const sid = `RM_${++this.created}`;
    this.rooms.set(name, { sid, identities: new Set(), emptyAt: this.now() });
    if (this.failCreateAfterWrite) { this.failCreateAfterWrite = false; throw new Error("simulated request timeout"); }
    return { sid, count: 0 };
  }

  async admission(name: string, sid: string, identity: string) {
    const room = this.lookup(name);
    if (!room || room.sid !== sid) return "missing";
    return room.identities.size < MEETING_CAPACITY || room.identities.has(identity) ? "ok" : "full";
  }

  async issue(name: string, account: Account, ttl: number) {
    return { url: "wss://example.test", token: JSON.stringify({ name, identity: account.id, ttl }) };
  }

  connect(name: string, identity: string) {
    const room = this.lookup(name);
    assert(room);
    if (room.identities.size >= MEETING_CAPACITY && !room.identities.has(identity)) return false;
    room.identities.add(identity);
    room.emptyAt = null;
    return true;
  }

  disconnect(name: string, identity: string) {
    const room = this.lookup(name);
    assert(room);
    room.identities.delete(identity);
    if (!room.identities.size) room.emptyAt = this.now();
  }

  async terminate(name: string, identities: string[]) {
    if (this.failTerminate) { this.failTerminate = false; throw new Error("simulated provider outage"); }
    this.revoked.set(name, new Set(identities));
    this.rooms.delete(name);
  }
}

async function fixture() {
  const db = await embeddedPool();
  const ideas = new PostgresIdeaRepository(db.pool);
  const idea = await ideas.createIdea(host, { ...input, tags: [] });
  await ideas.joinIdea(idea.id, guest.id);
  const store = new MeetingStore(db.pool);
  let now = Date.now();
  const clock = () => now;
  const provider = new FakeProvider(clock);
  const service = new MeetingService(store, provider, clock);
  return { db, ideas, idea, store, provider, service, clock, advance: (ms: number) => { now += ms; } };
}

test("meeting clock respects warning and hard deadline boundaries", () => {
  const start = Date.UTC(2026, 10, 19, 12, 0);
  const warn = start + MEETING_WARNING_MS;
  const end = start + MEETING_DURATION_MS;
  assert.equal(warn - start, 150 * 60_000);
  assert.equal(end - start, 180 * 60_000);
  assert.deepEqual(meetingClock(warn, end, warn - 1000), { warning: false, expired: false, remainingSeconds: 1801 });
  assert.deepEqual(meetingClock(warn, end, warn), { warning: true, expired: false, remainingSeconds: 1800 });
  assert.deepEqual(meetingClock(warn, end, end - 1000), { warning: true, expired: false, remainingSeconds: 1 });
  assert.deepEqual(meetingClock(warn, end, end), { warning: false, expired: true, remainingSeconds: 0 });
});

test("LiveKit grant only joins the named room under the account identity", async () => {
  const provider = new LiveKitMeetingProvider("wss://example.test", "test-key", "test-secret");
  const { token } = await provider.issue("ih-meeting-a", host, 45);
  const claims = decodeJwt(token);
  assert.equal(claims.sub, host.id);
  assert(claims.exp! - claims.nbf! <= 45);
  assert.deepEqual(claims.video, { roomJoin: true, room: "ih-meeting-a", canSubscribe: true, canPublish: true, canPublishData: false });
});

test("webhook signatures bind the issuer and the original request body", async () => {
  const key = "test-key";
  const secret = "test-secret";
  const body = '{"event":"participant_left", "room":{"sid":"RM_123","name":"ih-meeting-example"}}';
  const jwt = await new SignJWT({ sha256: createHash("sha256").update(body).digest("base64") })
    .setProtectedHeader({ alg: "HS256" }).setIssuer(key).setExpirationTime("1m").sign(Buffer.from(secret));
  const receiver = new LiveKitMeetingProvider("wss://example.test", key, secret).webhooks;
  const event = await receiver.receive(body, jwt);
  assert.equal(event.event, "participant_left");
  assert.equal(event.room?.sid, "RM_123");
  await assert.rejects(receiver.receive(JSON.stringify(JSON.parse(body)), jwt));
  await assert.rejects(new LiveKitMeetingProvider("wss://example.test", "other-key", secret).webhooks.receive(body, jwt));
});

test("one active session survives simultaneous starts, provider create timeout and a worker restart", async () => {
  const f = await fixture();
  try {
    f.provider.failCreateAfterWrite = true;
    const [first, second] = await Promise.all([
      f.service.start(f.idea.id, host.id, null), f.service.start(f.idea.id, guest.id, null),
    ]);
    assert.equal(first.session?.id, second.session?.id);
    assert.equal(first.session?.phase, "creating");
    f.advance(1000);
    const restarted = new MeetingService(new MeetingStore(f.db.pool), f.provider, f.clock);
    assert(await restarted.workOne());
    const active = await restarted.status(f.idea.id, host.id);
    assert.equal(active.session?.id, first.session?.id);
    assert.equal(active.session?.phase, "active");
    assert.equal(f.provider.created, 1);
    assert.equal(active.session!.expiresAt! - active.session!.startedAt!, MEETING_DURATION_MS);
  } finally { await f.db.close(); }
});

test("membership and archiving restrict entry, LiveKit capacity and duplicate identity are respected", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.service.start(f.idea.id, outsider.id, null), { code: "NOT_JOINED" });
    const active = (await f.service.start(f.idea.id, host.id, null)).session!;
    const name = `ih-meeting-${active.id}`;
    await assert.rejects(f.service.join(f.idea.id, outsider, active.id), { code: "NOT_JOINED" });
    const another = await f.ideas.createIdea(host, { ...input, tags: [] });
    await assert.rejects(f.service.join(another.id, host, active.id), { code: "MEETING_ENDED" });
    await f.ideas.setIdeaStatus(f.idea.id, host.id, "archived");
    const people = accounts.filter(account => account !== outsider).slice(0, MEETING_CAPACITY);
    for (const person of people) {
      if (person !== host && person !== guest) await f.ideas.joinIdea(f.idea.id, person.id);
      const join = await f.service.join(f.idea.id, person, active.id);
      assert.equal(JSON.parse(join.token).identity, person.id);
      assert(f.provider.connect(name, person.id));
    }
    const seventh = accounts.at(-1)!;
    await f.ideas.joinIdea(f.idea.id, seventh.id);
    await assert.rejects(f.service.join(f.idea.id, seventh, active.id), { code: "MEETING_FULL" });
    assert.equal(JSON.parse((await f.service.join(f.idea.id, host, active.id)).token).identity, host.id);
    assert.equal(f.provider.rooms.get(name)?.identities.size, MEETING_CAPACITY);
    assert.equal((await f.service.status(f.idea.id, host.id)).canStart, false);
    for (const person of people) f.provider.disconnect(name, person.id);
    f.advance(MEETING_GRACE_MS);
    await f.service.workOne();
    await assert.rejects(f.service.start(f.idea.id, host.id, active.id), { code: "MEETING_ARCHIVED" });
  } finally { await f.db.close(); }
});

test("last-disconnect grace survives reconnect, lost and late events, and a new session needs intent", async () => {
  const f = await fixture();
  try {
    const active = (await f.service.start(f.idea.id, host.id, null)).session!;
    const name = `ih-meeting-${active.id}`;
    const sid = f.provider.rooms.get(name)!.sid;
    await f.service.join(f.idea.id, host, active.id);
    assert(f.provider.connect(name, host.id));
    await f.store.signalRoom(name, sid, "participant_joined", f.clock());
    await f.service.workOne();
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.participants, 1);
    // Abrupt client loss with no webhook delivery.
    f.provider.disconnect(name, host.id);
    f.advance(MEETING_GRACE_MS - 1000);
    await f.service.workOne();
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.phase, "active");
    assert(f.provider.connect(name, host.id));
    assert.equal((await f.service.join(f.idea.id, host, active.id)).status.session?.expiresAt, active.expiresAt);
    f.provider.disconnect(name, host.id);
    f.advance(MEETING_GRACE_MS);
    await f.service.workOne();
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.reason, "empty");
    await f.store.signalRoom(name, sid, "participant_joined", f.clock());
    await assert.rejects(f.service.join(f.idea.id, host, active.id), { code: "MEETING_ENDED" });
    await assert.rejects(f.service.start(f.idea.id, host.id, null), { code: "MEETING_CHANGED" });
    const [a, b] = await Promise.all([f.service.start(f.idea.id, host.id, active.id), f.service.start(f.idea.id, guest.id, active.id)]);
    assert.equal(a.session?.id, b.session?.id);
    assert.notEqual(a.session?.id, active.id);
    assert.equal(f.provider.created, 2);
    // A stale room that reappears can be reclaimed without altering the new session.
    f.provider.rooms.set(name, { sid: "RM_stale", identities: new Set([host.id]), emptyAt: null });
    await f.store.signalRoom(name, "RM_stale", "room_started", f.clock());
    await f.service.workOne();
    assert(!f.provider.rooms.has(name));
    assert(f.provider.rooms.has(`ih-meeting-${a.session?.id}`));
  } finally { await f.db.close(); }
});

test("server cutoff does not require connected clients to cooperate and retries failed teardown", async () => {
  const f = await fixture();
  try {
    const active = (await f.service.start(f.idea.id, host.id, null)).session!;
    const name = `ih-meeting-${active.id}`;
    await f.service.join(f.idea.id, host, active.id);
    await f.service.join(f.idea.id, guest, active.id); // issued but never connected
    assert(f.provider.connect(name, host.id));
    f.advance(MEETING_WARNING_MS);
    await f.service.workOne();
    const late = await f.service.join(f.idea.id, guest, active.id);
    assert.equal(meetingClock(active.warnAt!, active.expiresAt!, late.status.serverNow).remainingSeconds, 1800);
    f.advance(MEETING_DURATION_MS - MEETING_WARNING_MS - MEETING_CLOSE_LEAD_MS);
    f.provider.failTerminate = true;
    assert(await f.service.workOne());
    assert(f.provider.rooms.has(name));
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.phase, "closing");
    await assert.rejects(f.service.join(f.idea.id, host, active.id), { code: "MEETING_ENDED" });
    f.advance(1000);
    assert(await f.service.workOne());
    assert(!f.provider.rooms.has(name));
    assert.deepEqual(f.provider.revoked.get(name), new Set([host.id, guest.id]));
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.reason, "expired");
  } finally { await f.db.close(); }
});

test("deleting a block denies entry before provider cleanup and preserves issued identities", async () => {
  const f = await fixture();
  try {
    const active = (await f.service.start(f.idea.id, host.id, null)).session!;
    const name = `ih-meeting-${active.id}`;
    await f.service.join(f.idea.id, host, active.id);
    await f.ideas.deleteIdea(f.idea.id, host.id);
    await assert.rejects(f.service.join(f.idea.id, host, active.id), { status: 404 });
    f.advance(1000);
    assert(await f.service.workOne());
    assert(!f.provider.rooms.has(name));
    assert.deepEqual(f.provider.revoked.get(name), new Set([host.id]));
  } finally { await f.db.close(); }
});

test("a worker can recover from a lost lease holder and close a room that nobody joined", async () => {
  const f = await fixture();
  try {
    const id = await f.store.reserve(f.idea.id, host.id, null, f.clock);
    const lease = await f.store.claim(f.clock());
    assert.equal(lease?.id, id);
    await f.provider.create(lease!.room_name); // provider succeeded before the worker died
    assert.equal(await f.service.workOne(), false);
    f.advance(12_000);
    assert(await f.service.workOne());
    assert.equal(f.provider.created, 1);
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.phase, "active");
    f.advance(MEETING_GRACE_MS - 12_000);
    assert(await f.service.workOne());
    assert.equal((await f.service.status(f.idea.id, host.id)).session?.reason, "empty");
  } finally { await f.db.close(); }
});
