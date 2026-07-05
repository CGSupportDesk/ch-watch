import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();

  if (!process.env.APP_USER || !process.env.APP_PASSWORD) return NextResponse.next();
  if (getSessionFromRequest(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/health") ||
    /\.(?:ico|svg|png|jpg|jpeg|gif|webp|avif|txt|xml|webmanifest)$/i.test(pathname)
  );
}
