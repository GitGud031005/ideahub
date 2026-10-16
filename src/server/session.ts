export const SESSION_COOKIE = "ideahub_auth";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export function getSessionToken(request: Request): string | null {
  const token = request.headers.get("cookie")?.split(";").map(p => p.trim()).find(p => p.startsWith(SESSION_COOKIE + "="))?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function sessionCookie(token: string, clear = false) {
  return `${SESSION_COOKIE}=${clear ? "" : token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${clear ? 0 : SESSION_MAX_AGE}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
