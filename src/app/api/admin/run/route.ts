import { NextRequest, NextResponse } from "next/server";
import {
  runContactScrape,
  runDirectorMonitor,
  runSponsorBackfill,
  runSponsorEnrich,
  runWebsiteDiscover,
} from "@/lib/jobs";
import { getSessionFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const jobs = {
  "sponsor-backfill": runSponsorBackfill,
  "sponsor-enrich": runSponsorEnrich,
  "director-monitor": runDirectorMonitor,
  "website-discover": runWebsiteDiscover,
  "contact-scrape": runContactScrape,
};

export async function POST(request: NextRequest) {
  if (!getSessionFromRequest(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/");
    return NextResponse.redirect(loginUrl, 303);
  }

  const form = await request.formData();
  const job = String(form.get("job") || "");
  const target = jobs[job as keyof typeof jobs];
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";

  if (!target) {
    url.searchParams.set("error", "unknown-job");
    return NextResponse.redirect(url, 303);
  }

  const result = await target();
  if ("error" in result && result.error) url.searchParams.set("error", String(result.error).slice(0, 80));
  url.searchParams.set("ran", job);
  return NextResponse.redirect(url, 303);
}
