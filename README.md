# CH Watch

Vercel version of the sponsor-removal watch app for Closing Gap Compliance.

The app imports UK licensed sponsor removals from 2026 onward, matches each removed sponsor to Companies House, stores directors/officers and registered address, uses Groq to discover official websites, then scrapes public business emails and phone numbers from those websites.

## What It Collects

- Removed sponsor licence entries from `licensed-sponsors-uk.com` history files.
- Companies House company number, legal name, status, address, SIC codes, and officers.
- Director/admin changes after the first officer baseline.
- Official website, public company emails, and public phone numbers where available.

Companies House and GOV.UK do not publish director mobile numbers or personal emails. This app only stores contacts found on public business websites or entered later from another verified source.

## Vercel Setup

1. Import this GitHub repo into Vercel.
2. Add a Postgres database in Vercel, for example Neon Postgres, and copy its `DATABASE_URL`.
3. Add these Vercel Environment Variables:

```env
DATABASE_URL=
COMPANIES_HOUSE_API_KEY=
GROQ_API_KEY=
CRON_SECRET=
APP_USER=
APP_PASSWORD=
MIN_EVENT_DATE=2026-01-01
SPONSOR_BACKFILL_START_PAGE=324
SPONSOR_BACKFILL_PAGES_PER_RUN=5
SPONSOR_BACKFILL_LINES_PER_RUN=1000
SPONSOR_ENRICH_LIMIT_PER_RUN=25
DIRECTOR_MONITOR_LIMIT_PER_RUN=50
WEBSITE_DISCOVER_LIMIT_PER_RUN=10
CONTACT_SCRAPE_LIMIT_PER_RUN=10
```

4. Redeploy the project.
5. Open `/api/health` to confirm database and keys are detected.
6. Open `/` and log in with `APP_USER` and `APP_PASSWORD`.

The database schema is created automatically on first load.

## First Backfill

Use the dashboard buttons in this order:

1. `Import removals`
2. `Match companies`
3. `Check directors`
4. `Find websites`
5. `Scrape contacts`

Repeat those buttons while the counts are still growing. For the 2026 base import, `Import removals` can be run multiple times because it saves a cursor and skips duplicates.

## Cron Routes

The committed `vercel.json` uses once-per-day schedules so it can deploy on Vercel Hobby.

- `/api/cron/sponsor-backfill`
- `/api/cron/sponsor-enrich`
- `/api/cron/director-monitor`
- `/api/cron/website-discover`
- `/api/cron/contact-scrape`

If you use Vercel Pro or another external cron service, these can run more frequently. Keep the same order: removals, match companies, directors, websites, contacts.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Then open `http://localhost:3000`.
