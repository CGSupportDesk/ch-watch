import { NextResponse } from "next/server";
import { ensureSchema, getSql, hasDatabase } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const database = {
    configured: hasDatabase(),
    schema: "not_checked",
    ping: "not_checked",
    error: null as string | null,
  };
  try {
    if (database.configured) {
      await ensureSchema();
      await getSql()`SELECT 1`;
      database.ping = "ok";
      database.schema = "ok";
    }
  } catch (error) {
    database.error = error instanceof Error ? error.message : String(error);
    database.ping = "failed";
  }

  return NextResponse.json({
    ok: !database.error,
    database,
    env: {
      COMPANIES_HOUSE_API_KEY: Boolean(process.env.COMPANIES_HOUSE_API_KEY),
      GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
      CRON_SECRET: Boolean(process.env.CRON_SECRET),
      APP_USER: Boolean(process.env.APP_USER),
      APP_PASSWORD: Boolean(process.env.APP_PASSWORD),
    },
    checkedAt: new Date().toISOString(),
  });
}
