import { NextResponse } from "next/server";
import { expiredSessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL("/login", request.url);
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(SESSION_COOKIE, "", expiredSessionCookieOptions());
  return response;
}
