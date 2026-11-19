import { MEETING_CLOSE_LEAD_MS, MEETING_DURATION_MS, MEETING_WARNING_MS } from "@/lib/meeting";
import { AppError } from "../errors";

export function meetingPilot(ideaId: string) {
  return process.env.IDEAHUB_MEETINGS_ENABLED === "1" && process.env.IDEAHUB_MEETINGS_PILOT_ID === ideaId;
}

type MeetingTimingEnv = Partial<Pick<NodeJS.ProcessEnv,
  "NODE_ENV" | "VERCEL_ENV" | "IDEAHUB_MEETING_TEST_SECONDS" | "IDEAHUB_MEETING_TEST_WARNING_SECONDS">>;

export function meetingTiming(env: MeetingTimingEnv = process.env) {
  const productionDeployment = env.NODE_ENV === "production" && env.VERCEL_ENV !== "preview";
  if (productionDeployment || !env.IDEAHUB_MEETING_TEST_SECONDS)
    return { duration: MEETING_DURATION_MS, warning: MEETING_WARNING_MS };
  const duration = Number(env.IDEAHUB_MEETING_TEST_SECONDS) * 1000;
  const lead = Number(env.IDEAHUB_MEETING_TEST_WARNING_SECONDS) * 1000;
  if (!Number.isSafeInteger(duration) || !Number.isSafeInteger(lead) || duration < 60_000 ||
      duration >= MEETING_DURATION_MS || lead <= MEETING_CLOSE_LEAD_MS || lead >= duration)
    throw new AppError(503, "MEETING_CONFIG", "Cấu hình thời lượng thử nghiệm không hợp lệ");
  return { duration, warning: duration - lead };
}
