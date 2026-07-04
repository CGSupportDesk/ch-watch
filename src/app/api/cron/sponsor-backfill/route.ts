import { NextRequest } from "next/server";
import { assertCron, cronJson, unauthorized } from "@/lib/cron";
import { runSponsorBackfill } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    return cronJson({ ok: true, result: await runSponsorBackfill() });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized cron request") return unauthorized();
    return cronJson({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
