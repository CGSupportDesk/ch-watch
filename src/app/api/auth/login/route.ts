import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const next = safeNext(String(form.get("next") || "/"));
  const url = new URL(next, request.url);

  if (!process.env.APP_USER || !process.env.APP_PASSWORD || username !== process.env.APP_USER || password !== process.env.APP_PASSWORD) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl, 303);
  }

  const response = NextResponse.redirect(url, 303);
  response.cookies.set(SESSION_COOKIE, createSessionToken(username), sessionCookieOptions());
  return response;
}

function safeNext(value: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
