import { NextRequest, NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function assertCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    throw new Error("Unauthorized cron request");
  }
}

export function cronJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
