import { AccessToken, RoomServiceClient, TwirpError, WebhookReceiver } from "livekit-server-sdk";
import { MEETING_CAPACITY, MEETING_GRACE_MS } from "@/lib/meeting";
import type { Account } from "@/lib/domain";

export type RoomSnapshot = { sid: string; count: number };
export interface MeetingProvider {
  inspect(name: string): Promise<RoomSnapshot | null>;
  create(name: string): Promise<RoomSnapshot>;
  admission(name: string, sid: string, identity: string): Promise<"ok" | "full" | "missing">;
  issue(name: string, account: Account, ttlSeconds: number): Promise<{ url: string; token: string }>;
  terminate(name: string, identities: string[]): Promise<void>;
}

function missing(error: unknown) {
  return error instanceof TwirpError && error.code === "not_found";
}

export class LiveKitMeetingProvider implements MeetingProvider {
  private rooms: RoomServiceClient;
  readonly webhooks: WebhookReceiver;

  constructor(private url: string, private key: string, private secret: string) {
    this.rooms = new RoomServiceClient(url, key, secret, { requestTimeout: 3, failover: false });
    this.webhooks = new WebhookReceiver(key, secret);
  }

  async inspect(name: string) {
    const [room] = await this.rooms.listRooms([name]);
    return room ? { sid: room.sid, count: room.numParticipants } : null;
  }

  async create(name: string) {
    const room = await this.rooms.createRoom({
      name, maxParticipants: MEETING_CAPACITY, emptyTimeout: MEETING_GRACE_MS / 1000,
      departureTimeout: MEETING_GRACE_MS / 1000,
    });
    return { sid: room.sid, count: room.numParticipants };
  }

  async admission(name: string, sid: string, identity: string) {
    const room = await this.inspect(name);
    if (!room || room.sid !== sid) return "missing";
    if (room.count < MEETING_CAPACITY) return "ok";
    try {
      const participants = await this.rooms.listParticipants(name);
      return participants.length < MEETING_CAPACITY || participants.some(participant => participant.identity === identity)
        ? "ok" : "full";
    } catch (error) {
      if (missing(error)) return "missing";
      throw error;
    }
  }

  async issue(name: string, account: Account, ttl: number) {
    const access = new AccessToken(this.key, this.secret, { identity: account.id, name: account.name, ttl });
    access.addGrant({ roomJoin: true, room: name, canSubscribe: true, canPublish: true, canPublishData: false });
    return { url: this.url, token: await access.toJwt() };
  }

  async terminate(name: string, identities: string[]) {
    // Cloud accepts a cutoff within 60 seconds of provider time. A future
    // cutoff covers grants refreshed just before disconnection.
    const revokeTokenTs = BigInt(Math.floor(Date.now() / 1000) + 30);
    const revocations = await Promise.allSettled(identities.map(identity =>
      this.rooms.removeParticipant(name, identity, { revokeTokenTs })));
    // Attempt teardown even when a revocation errors. A room already
    // auto-closed by LiveKit may return not_found for revocation as well.
    // Disabling project auto-create keeps old grants out of an absent room.
    try { await this.rooms.deleteRoom(name); }
    catch (error) { if (!missing(error)) throw error; }
    if (revocations.some(result => result.status === "rejected" && !missing(result.reason)))
      throw new Error("LiveKit did not confirm all token revocations");
  }
}
