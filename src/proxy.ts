import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicPath(pathname)) return NextResponse.next();

  const user = process.env.APP_USER;
  const password = process.env.APP_PASSWORD;
  if (!user || !password) return NextResponse.next();

  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) return challenge();

  const decoded = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const givenUser = separator >= 0 ? decoded.slice(0, separator) : "";
  const givenPassword = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (givenUser !== user || givenPassword !== password) return challenge();
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

function isPublicPath(pathname: string) {
  return pathname.startsWith("/api/cron") || pathname.startsWith("/api/health");
}

function challenge() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="CH Watch"',
    },
  });
}
