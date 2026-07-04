export const MIN_EVENT_DATE = process.env.MIN_EVENT_DATE || "2026-01-01";

export const limits = {
  sponsorBackfillPages: boundedInt(process.env.SPONSOR_BACKFILL_PAGES_PER_RUN, 5, 1, 20),
  sponsorBackfillStartPage: boundedInt(process.env.SPONSOR_BACKFILL_START_PAGE, 324, 1, 100_000),
  sponsorEnrichLimit: boundedInt(process.env.SPONSOR_ENRICH_LIMIT_PER_RUN, 25, 1, 100),
  directorMonitorLimit: boundedInt(process.env.DIRECTOR_MONITOR_LIMIT_PER_RUN, 50, 1, 200),
  websiteDiscoverLimit: boundedInt(process.env.WEBSITE_DISCOVER_LIMIT_PER_RUN, 10, 1, 100),
  contactScrapeLimit: boundedInt(process.env.CONTACT_SCRAPE_LIMIT_PER_RUN, 10, 1, 100),
};

export const urls = {
  sponsorUpdatesBase:
    process.env.SPONSOR_UPDATES_BASE_URL ||
    "https://res.licensed-sponsors-uk.com/updates/updates.{page}.txt",
};

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const n = Number.parseInt(raw || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
