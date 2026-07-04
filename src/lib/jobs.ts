import { MIN_EVENT_DATE, limits, urls } from "./config";
import { companyProfile, chCallCount, matchCompanyNumber, resetChCallCount, syncOfficers, upsertCompany } from "./companies-house";
import { type DbRow, ensureSchema, finishRun, getSql, getState, setState, startRun } from "./db";
import { findOfficialWebsite } from "./groq";
import { scrapeWebsite } from "./contacts";
import { clean, sha1, sponsorKey } from "./text";

export async function runSponsorBackfill() {
  await ensureSchema();
  const sql = getSql();
  const startPage = Number(await getState("sponsor_backfill_next_page", String(limits.sponsorBackfillStartPage)));
  const startLineOffset = Number(await getState("sponsor_backfill_line_offset", "0"));
  const runId = await startRun("sponsor-backfill", {
    startPage,
    startLineOffset,
    pages: limits.sponsorBackfillPages,
    lineLimit: limits.sponsorBackfillLines,
  });
  let processed = 0;
  let created = 0;
  let done = false;
  let paused = false;
  let error: string | null = null;
  let lastPage = startPage - 1;
  let lastLineOffset = startLineOffset;
  let remainingLines = limits.sponsorBackfillLines;

  try {
    if ((await getState("sponsor_backfill_done")) === "1") {
      done = true;
    } else {
      pageLoop:
      for (let page = startPage; page < startPage + limits.sponsorBackfillPages && remainingLines > 0; page++) {
        const url = urls.sponsorUpdatesBase.replace("{page}", String(page));
        const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "ClosingGapCompliance/1.0" } });
        if (res.status === 404) {
          await setState("sponsor_backfill_done", "1");
          await setState("sponsor_backfill_line_offset", "0");
          done = true;
          break;
        }
        if (!res.ok) throw new Error(`Update page ${page} HTTP ${res.status}`);
        const body = await res.text();
        const lines = body.split(/\r?\n/);
        const fromLine = page === startPage ? Math.max(0, Math.min(startLineOffset, lines.length)) : 0;
        for (let lineIndex = fromLine; lineIndex < lines.length; lineIndex++) {
          if (remainingLines <= 0) {
            await setState("sponsor_backfill_next_page", String(page));
            await setState("sponsor_backfill_line_offset", String(lineIndex));
            lastPage = page;
            lastLineOffset = lineIndex;
            paused = true;
            break pageLoop;
          }
          remainingLines--;
          const line = lines[lineIndex];
          if (!line.trim()) continue;
          const event = safeJson(line);
          if (!event || event.type !== "removed") continue;
          const date = isoDate(event.date);
          if (!date || date < MIN_EVENT_DATE) continue;
          const data = event.data || {};
          const name = clean(data.company);
          if (!name) continue;
          const town = clean(data.city);
          const county = clean(data.county);
          const tiers = Array.isArray(data.tiers) ? data.tiers.map(clean).filter(Boolean).join(" | ") : "";
          const key = sponsorKey(name, town, county);
          const fingerprint = sha1(`history|${event.date}|${key}|${tiers}`);
          const inserted = (await sql`
            INSERT INTO sponsor_removed (
              sponsor_key, organisation_name, town, county, licence_types, routes,
              removed_on, detected_at, source_url, match_status, fingerprint
            )
            VALUES (
              ${key}, ${name}, ${town || null}, ${county || null}, ${tiers || null}, ${tiers || null},
              ${date}, ${event.date ? new Date(event.date).toISOString() : new Date().toISOString()},
              ${url}, 'pending', ${fingerprint}
            )
            ON CONFLICT (fingerprint) DO NOTHING
            RETURNING id
          `) as DbRow[];
          processed++;
          if (inserted.length) created++;
        }
        lastPage = page;
        lastLineOffset = 0;
        await setState("sponsor_backfill_next_page", String(page + 1));
        await setState("sponsor_backfill_line_offset", "0");
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(runId, { processed, created, error, meta: { lastPage, lastLineOffset, done, paused } });
  return { processed, created, error, lastPage, lastLineOffset, done, paused };
}

export async function runSponsorEnrich() {
  await ensureSchema();
  const sql = getSql();
  resetChCallCount();
  const runId = await startRun("sponsor-enrich");
  let processed = 0;
  let updated = 0;
  let error: string | null = null;

  try {
    const rows = (await sql`
      SELECT id, organisation_name
      FROM sponsor_removed
      WHERE enriched_at IS NULL
      ORDER BY id ASC
      LIMIT ${limits.sponsorEnrichLimit}
    `) as DbRow[];
    for (const row of rows) {
      processed++;
      try {
        const match = await matchCompanyNumber(String(row.organisation_name));
        if (!match.companyNumber) {
          await sql`
            UPDATE sponsor_removed
            SET match_status = ${match.status}, match_notes = ${match.notes}, enriched_at = now()
            WHERE id = ${row.id}
          `;
          continue;
        }
        const profile = await companyProfile(match.companyNumber);
        let officerNotes = "";
        if (profile) {
          await upsertCompany(profile);
          try {
            await syncOfficers(match.companyNumber);
          } catch (officerError) {
            officerNotes =
              officerError instanceof Error
                ? `; officer sync pending: ${officerError.message}`
                : `; officer sync pending: ${String(officerError)}`;
          }
        }
        await sql`
          UPDATE sponsor_removed
          SET company_number = ${match.companyNumber}, match_status = ${match.status},
              match_notes = ${match.notes + officerNotes}, enriched_at = now()
          WHERE id = ${row.id}
        `;
        updated++;
      } catch (itemError) {
        await sql`
          UPDATE sponsor_removed
          SET match_status = 'error', match_notes = ${itemError instanceof Error ? itemError.message : String(itemError)}, enriched_at = now()
          WHERE id = ${row.id}
        `;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(runId, { processed, updated, error, meta: { companiesHouseCalls: chCallCount() } });
  return { processed, updated, companiesHouseCalls: chCallCount(), error };
}

export async function runWebsiteDiscover() {
  await ensureSchema();
  const sql = getSql();
  const runId = await startRun("website-discover");
  let processed = 0;
  let updated = 0;
  let error: string | null = null;
  try {
    const rows = (await sql`
      SELECT c.company_number, c.company_name, c.registered_office_address,
             sr.organisation_name, sr.town, sr.county
      FROM companies c
      LEFT JOIN sponsor_removed sr ON sr.company_number = c.company_number
      WHERE (c.website_url IS NULL OR c.website_url = '')
        AND (c.website_discovered_at IS NULL OR c.website_discovery_status = 'error' OR c.website_discovered_at < now() - interval '30 days')
      ORDER BY c.first_seen DESC
      LIMIT ${limits.websiteDiscoverLimit}
    `) as DbRow[];
    for (const row of rows) {
      processed++;
      const name = String(row.organisation_name || row.company_name);
      try {
        const result = await findOfficialWebsite({
          companyName: name,
          town: row.town ? String(row.town) : null,
          county: row.county ? String(row.county) : null,
          address: row.registered_office_address ? String(row.registered_office_address) : null,
        });
        const notes = `confidence=${result.confidence}; ${result.reason || ""}; sources=${result.sources.slice(0, 3).join(" | ")}`;
        if (result.website) {
          await sql`
            UPDATE companies
            SET website_url = ${result.website}, website_discovered_at = now(),
                website_discovery_status = 'found', website_discovery_notes = ${notes},
                last_website_scrape = NULL
            WHERE company_number = ${row.company_number}
          `;
          updated++;
        } else {
          await sql`
            UPDATE companies
            SET website_discovered_at = now(), website_discovery_status = 'not_found',
                website_discovery_notes = ${notes}
            WHERE company_number = ${row.company_number}
          `;
        }
      } catch (itemError) {
        await sql`
          UPDATE companies
          SET website_discovered_at = now(), website_discovery_status = 'error',
              website_discovery_notes = ${itemError instanceof Error ? itemError.message : String(itemError)}
          WHERE company_number = ${row.company_number}
        `;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(runId, { processed, updated, error });
  return { processed, updated, error };
}

export async function runDirectorMonitor() {
  await ensureSchema();
  const sql = getSql();
  resetChCallCount();
  const runId = await startRun("director-monitor");
  let processed = 0;
  let updated = 0;
  let error: string | null = null;

  try {
    const rows = (await sql`
      SELECT company_number
      FROM companies
      WHERE status = 'sponsor-removed'
      ORDER BY officers_synced_at ASC NULLS FIRST, first_seen DESC
      LIMIT ${limits.directorMonitorLimit}
    `) as DbRow[];
    for (const row of rows) {
      processed++;
      try {
        const result = await syncOfficers(String(row.company_number), { detectChanges: true });
        updated += result.changes;
      } catch {
        // One failed company should not stop the remaining monitoring batch.
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(runId, { processed, updated, error, meta: { companiesHouseCalls: chCallCount() } });
  return { processed, directorChanges: updated, companiesHouseCalls: chCallCount(), error };
}

export async function runContactScrape() {
  await ensureSchema();
  const sql = getSql();
  const runId = await startRun("contact-scrape");
  let processed = 0;
  let created = 0;
  let error: string | null = null;
  try {
    const rows = (await sql`
      SELECT company_number, company_name, website_url
      FROM companies
      WHERE website_url IS NOT NULL AND website_url <> ''
        AND (last_website_scrape IS NULL OR last_website_scrape < now() - interval '30 days')
      ORDER BY first_seen DESC
      LIMIT ${limits.contactScrapeLimit}
    `) as DbRow[];
    for (const row of rows) {
      processed++;
      try {
        const result = await scrapeWebsite(String(row.company_name), String(row.website_url));
        for (const [email, source] of result.emails) {
          const inserted = (await sql`
            INSERT INTO scraped_contacts (company_number, source_url, contact_type, value)
            VALUES (${row.company_number}, ${source}, 'email', ${email})
            ON CONFLICT (company_number, contact_type, value) DO NOTHING
            RETURNING id
          `) as DbRow[];
          if (inserted.length) created++;
        }
        for (const [phone, source] of result.phones) {
          const inserted = (await sql`
            INSERT INTO scraped_contacts (company_number, source_url, contact_type, value)
            VALUES (${row.company_number}, ${source}, 'phone', ${phone})
            ON CONFLICT (company_number, contact_type, value) DO NOTHING
            RETURNING id
          `) as DbRow[];
          if (inserted.length) created++;
        }
        await sql`UPDATE companies SET last_website_scrape = now() WHERE company_number = ${row.company_number}`;
      } catch {
        await sql`UPDATE companies SET last_website_scrape = now() WHERE company_number = ${row.company_number}`;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  await finishRun(runId, { processed, created, error });
  return { processed, created, error };
}

function safeJson(line: string) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isoDate(value: unknown) {
  const time = Date.parse(String(value || ""));
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}
