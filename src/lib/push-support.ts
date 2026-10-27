export type PushSupport = "available" | "install-ios" | "unsupported";
export interface PushEnvironment { userAgent: string; platform: string; maxTouchPoints: number; standalone: boolean; secure: boolean; serviceWorker: boolean; pushManager: boolean; notification: boolean }
export function isAppleMobile({userAgent,platform,maxTouchPoints}:Pick<PushEnvironment,"userAgent"|"platform"|"maxTouchPoints">) {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}
export function pushSupport(environment: PushEnvironment): PushSupport {
  if (isAppleMobile(environment) && !environment.standalone) return "install-ios";
  return environment.secure && environment.serviceWorker && environment.pushManager && environment.notification ? "available" : "unsupported";
}
export function browserPushSupport(): PushSupport {
  return pushSupport({userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints,standalone:window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & {standalone?:boolean}).standalone===true,secure:window.isSecureContext,serviceWorker:"serviceWorker" in navigator,pushManager:"PushManager" in window,notification:"Notification" in window});
}
