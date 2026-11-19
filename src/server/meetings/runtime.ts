import { getDatabasePool } from "../database";
import { AppError } from "../errors";
import { meetingTiming } from "./config";
import { LiveKitMeetingProvider } from "./provider";
import { MeetingService } from "./service";
import { MeetingStore } from "./store";

let instance: { store: MeetingStore; provider: LiveKitMeetingProvider; service: MeetingService } | undefined;
export function meetings() {
  if (instance) return instance;
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (process.env.IDEAHUB_STORAGE !== "postgres" || !url || !key || !secret)
    throw new AppError(503, "MEETING_CONFIG", "Phòng họp chưa được cấu hình");
  const endpoint = URL.parse(url);
  if (!endpoint || endpoint.protocol !== "wss:" || endpoint.username || endpoint.password ||
      endpoint.pathname !== "/" || endpoint.search || endpoint.hash)
    throw new AppError(503, "MEETING_CONFIG", "Cấu hình địa chỉ phòng họp không hợp lệ");
  const store = new MeetingStore(getDatabasePool());
  const provider = new LiveKitMeetingProvider(url, key, secret);
  const service = new MeetingService(store, provider, Date.now, meetingTiming());
  return instance = { store, provider, service };
}
