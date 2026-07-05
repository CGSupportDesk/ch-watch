import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;
export type DbRow = Record<string, unknown>;

let sqlClient: Sql | null = null;
let schemaReady = false;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export function getSql() {
  if (!sqlClient) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL or POSTGRES_URL is not set");
    sqlClient = neon(url);
  }
  return sqlClient;
}

export async function ensureSchema() {
  if (schemaReady) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sponsor_removed (
      id BIGSERIAL PRIMARY KEY,
      sponsor_key TEXT NOT NULL,
      organisation_name TEXT NOT NULL,
      town TEXT,
      county TEXT,
      licence_types TEXT,
      routes TEXT,
      removed_on DATE,
      detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ,
      source_url TEXT,
      company_number TEXT,
      match_status TEXT,
      match_notes TEXT,
      enriched_at TIMESTAMPTZ,
      fingerprint TEXT NOT NULL UNIQUE
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sponsor_removed_company_idx ON sponsor_removed(company_number)`;
  await sql`CREATE INDEX IF NOT EXISTS sponsor_removed_enriched_idx ON sponsor_removed(enriched_at)`;
  await sql`
    CREATE TABLE IF NOT EXISTS companies (
      company_number TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sponsor-removed',
      status_detail TEXT,
      incorporation_date DATE,
      company_type TEXT,
      sic_codes JSONB,
      registered_office_address TEXT,
      registered_office_json JSONB,
      jurisdiction TEXT,
      website_url TEXT,
      website_discovered_at TIMESTAMPTZ,
      website_discovery_status TEXT,
      website_discovery_notes TEXT,
      last_website_scrape TIMESTAMPTZ,
      contact_scrape_version INTEGER NOT NULL DEFAULT 0,
      officers_synced_at TIMESTAMPTZ,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_synced TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS officers_synced_at TIMESTAMPTZ`;
  await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_scrape_version INTEGER NOT NULL DEFAULT 0`;
  await sql`CREATE INDEX IF NOT EXISTS companies_status_idx ON companies(status)`;
  await sql`CREATE INDEX IF NOT EXISTS companies_website_idx ON companies(website_url)`;
  await sql`
    CREATE TABLE IF NOT EXISTS officers (
      id BIGSERIAL PRIMARY KEY,
      company_number TEXT NOT NULL REFERENCES companies(company_number) ON DELETE CASCADE,
      officer_key TEXT,
      officer_name TEXT NOT NULL,
      officer_role TEXT,
      appointed_on DATE,
      resigned_on DATE,
      occupation TEXT,
      nationality TEXT,
      country_of_residence TEXT,
      dob_month INTEGER,
      dob_year INTEGER,
      address TEXT,
      address_json JSONB,
      identity_verified BOOLEAN,
      UNIQUE(company_number, officer_name, appointed_on)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS officers_company_idx ON officers(company_number)`;
  await sql`
    CREATE TABLE IF NOT EXISTS director_changes (
      id BIGSERIAL PRIMARY KEY,
      company_number TEXT NOT NULL REFERENCES companies(company_number) ON DELETE CASCADE,
      officer_key TEXT NOT NULL,
      officer_name TEXT NOT NULL,
      officer_role TEXT,
      change_type TEXT NOT NULL,
      detail JSONB DEFAULT '{}'::jsonb,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      fingerprint TEXT NOT NULL UNIQUE
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS director_changes_company_idx ON director_changes(company_number)`;
  await sql`CREATE INDEX IF NOT EXISTS director_changes_observed_idx ON director_changes(observed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS director_changes_type_idx ON director_changes(change_type)`;
  await sql`
    CREATE TABLE IF NOT EXISTS scraped_contacts (
      id BIGSERIAL PRIMARY KEY,
      company_number TEXT NOT NULL REFERENCES companies(company_number) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      contact_type TEXT NOT NULL,
      value TEXT NOT NULL,
      quality_score INTEGER,
      quality_label TEXT,
      quality_reason TEXT,
      scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(company_number, contact_type, value)
    )
  `;
  await sql`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS quality_score INTEGER`;
  await sql`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS quality_label TEXT`;
  await sql`ALTER TABLE scraped_contacts ADD COLUMN IF NOT EXISTS quality_reason TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS scraped_contacts_company_idx ON scraped_contacts(company_number)`;
  await sql`CREATE INDEX IF NOT EXISTS scraped_contacts_quality_idx ON scraped_contacts(quality_label, quality_score DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      processed INTEGER DEFAULT 0,
      created INTEGER DEFAULT 0,
      updated INTEGER DEFAULT 0,
      error TEXT,
      meta JSONB DEFAULT '{}'::jsonb
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS runs_kind_started_idx ON runs(kind, started_at DESC)`;
  schemaReady = true;
}

export async function getState(key: string, fallback = "") {
  const rows = (await getSql()`SELECT value FROM app_state WHERE key = ${key}`) as DbRow[];
  return rows[0]?.value ? String(rows[0].value) : fallback;
}

export async function setState(key: string, value: string) {
  await getSql()`
    INSERT INTO app_state (key, value, updated_at)
    VALUES (${key}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `;
}

export async function startRun(kind: string, meta: Record<string, unknown> = {}) {
  const rows = (await getSql()`
    INSERT INTO runs (kind, meta)
    VALUES (${kind}, ${JSON.stringify(meta)}::jsonb)
    RETURNING id
  `) as DbRow[];
  return Number(rows[0].id);
}

export async function finishRun(
  id: number,
  patch: { processed?: number; created?: number; updated?: number; error?: string | null; meta?: Record<string, unknown> },
) {
  await getSql()`
    UPDATE runs
    SET finished_at = now(),
        processed = ${patch.processed ?? 0},
        created = ${patch.created ?? 0},
        updated = ${patch.updated ?? 0},
        error = ${patch.error ?? null},
        meta = COALESCE(meta, '{}'::jsonb) || ${JSON.stringify(patch.meta || {})}::jsonb
    WHERE id = ${id}
  `;
}
