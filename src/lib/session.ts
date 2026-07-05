import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "ch_watch_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AppSession = {
  user: string;
  expiresAt: number;
};

export function createSessionToken(user: string) {
  const payload = base64Url(
    JSON.stringify({
      user,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    } satisfies AppSession),
  );
  return `${payload}.${sign(payload)}`;
}

export function getSessionFromRequest(request: NextRequest) {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value || "");
}

export function verifySessionToken(token: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AppSession;
    const expectedUser = process.env.APP_USER;
    if (!expectedUser || session.user !== expectedUser) return null;
    if (!session.expiresAt || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function expiredSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function sign(payload: string) {
  const secret = process.env.AUTH_SECRET || process.env.CRON_SECRET || process.env.APP_PASSWORD || "";
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
