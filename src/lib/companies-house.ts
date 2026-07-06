import { requireEnv } from "./config";
import { type DbRow, getSql } from "./db";
import { clean, formatAddress, searchName, similarity, sha1 } from "./text";

type CompanySearchItem = {
  title?: string;
  company_number?: string;
  company_status?: string;
};

type CompanyProfile = {
  company_number?: string;
  company_name?: string;
  company_status?: string;
  date_of_creation?: string;
  type?: string;
  sic_codes?: string[];
  registered_office_address?: Record<string, unknown>;
  jurisdiction?: string;
};

type OfficerItem = {
  name?: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  occupation?: string;
  nationality?: string;
  country_of_residence?: string;
  date_of_birth?: { month?: number; year?: number };
  address?: Record<string, unknown>;
  identity_verification_status?: string;
  links?: { officer?: { appointments?: string } };
};

type OfficerSnapshot = {
  companyNumber: string;
  officerKey: string;
  officerName: string;
  officerRole: string | null;
  appointedOn: string | null;
  resignedOn: string | null;
  occupation: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
  dobMonth: number | null;
  dobYear: number | null;
  address: string | null;
  addressJson: Record<string, unknown> | null;
  identityVerified: boolean | null;
};

type OfficerRow = {
  officer_key?: unknown;
  officer_name?: unknown;
  officer_role?: unknown;
  appointed_on?: unknown;
  resigned_on?: unknown;
  occupation?: unknown;
  nationality?: unknown;
  country_of_residence?: unknown;
  address?: unknown;
  identity_verified?: unknown;
};

type Sql = ReturnType<typeof getSql>;

let calls = 0;

export function chCallCount() {
  return calls;
}

export function resetChCallCount() {
  calls = 0;
}

async function chFetch<T>(path: string): Promise<T | null> {
  const key = requireEnv("COMPANIES_HOUSE_API_KEY");
  const auth = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`https://api.company-information.service.gov.uk${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "User-Agent": "CWWatch/1.0",
    },
    cache: "no-store",
  });
  calls++;
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Companies House HTTP ${res.status} on ${path}`);
  return (await res.json()) as T;
}

export async function searchCompanies(term: string, itemsPerPage = 8) {
  const params = new URLSearchParams({ q: term, items_per_page: String(itemsPerPage) });
  const json = await chFetch<{ items?: CompanySearchItem[] }>(`/search/companies?${params}`);
  return json?.items || [];
}

export async function companyProfile(companyNumber: string) {
  return chFetch<CompanyProfile>(`/company/${encodeURIComponent(companyNumber)}`);
}

export async function companyOfficers(companyNumber: string) {
  const params = new URLSearchParams({ items_per_page: "100" });
  const json = await chFetch<{ items?: OfficerItem[] }>(`/company/${encodeURIComponent(companyNumber)}/officers?${params}`);
  return json?.items || [];
}

export async function matchCompanyNumber(name: string) {
  const term = searchName(name);
  const items = await searchCompanies(term, 8);
  let best: CompanySearchItem | null = null;
  let bestScore = 0;
  for (const item of items) {
    if (!item.company_number || !item.title) continue;
    let score = similarity(term, item.title);
    if (item.company_status === "active") score += 3;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  if (!best || !best.company_number || bestScore < 55) {
    return { companyNumber: null, status: "no_match", notes: `No confident Companies House match for ${term}` };
  }
  return {
    companyNumber: best.company_number,
    status: bestScore >= 82 ? "matched" : "possible_match",
    notes: `Matched "${best.title}" at score ${Math.round(bestScore)}`,
  };
}

export async function upsertCompany(profile: CompanyProfile) {
  if (!profile.company_number) return;
  const sql = getSql();
  const statusDetail = profile.company_status ? `Companies House status: ${profile.company_status}` : null;
  const address = formatAddress(profile.registered_office_address);
  await sql`
    INSERT INTO companies (
      company_number, company_name, status, status_detail, incorporation_date,
      company_type, sic_codes, registered_office_address, registered_office_json,
      jurisdiction, first_seen, last_synced
    )
    VALUES (
      ${profile.company_number},
      ${profile.company_name || ""},
      'sponsor-removed',
      ${statusDetail},
      ${profile.date_of_creation || null},
      ${profile.type || null},
      ${JSON.stringify(profile.sic_codes || [])}::jsonb,
      ${address || null},
      ${JSON.stringify(profile.registered_office_address || null)}::jsonb,
      ${profile.jurisdiction || null},
      now(),
      now()
    )
    ON CONFLICT (company_number) DO UPDATE SET
      company_name = excluded.company_name,
      status = excluded.status,
      status_detail = excluded.status_detail,
      incorporation_date = excluded.incorporation_date,
      company_type = excluded.company_type,
      sic_codes = excluded.sic_codes,
      registered_office_address = excluded.registered_office_address,
      registered_office_json = excluded.registered_office_json,
      jurisdiction = excluded.jurisdiction,
      last_synced = now()
  `;
}

export async function syncOfficers(companyNumber: string, options: { detectChanges?: boolean } = {}) {
  const sql = getSql();
  const oldRows = (await sql`
    SELECT officer_key, officer_name, officer_role, appointed_on, resigned_on,
           occupation, nationality, country_of_residence, address, identity_verified
    FROM officers
    WHERE company_number = ${companyNumber}
  `) as OfficerRow[];
  const officers = await companyOfficers(companyNumber);
  const snapshots = officers.map((officer) => officerSnapshot(companyNumber, officer));

  let changes = 0;
  if (options.detectChanges && oldRows.length) {
    changes = await recordOfficerChanges(sql, companyNumber, oldRows, snapshots);
  }

  await sql`DELETE FROM officers WHERE company_number = ${companyNumber}`;
  for (const officer of snapshots) {
    await sql`
      INSERT INTO officers (
        company_number, officer_key, officer_name, officer_role, appointed_on, resigned_on,
        occupation, nationality, country_of_residence, dob_month, dob_year,
        address, address_json, identity_verified
      )
      VALUES (
        ${companyNumber}, ${officer.officerKey}, ${officer.officerName}, ${officer.officerRole},
        ${officer.appointedOn}, ${officer.resignedOn},
        ${officer.occupation}, ${officer.nationality},
        ${officer.countryOfResidence}, ${officer.dobMonth},
        ${officer.dobYear}, ${officer.address},
        ${JSON.stringify(officer.addressJson)}::jsonb,
        ${officer.identityVerified}
      )
      ON CONFLICT (company_number, officer_name, appointed_on) DO NOTHING
    `;
  }
  await sql`
    UPDATE companies
    SET officers_synced_at = now(), last_synced = now()
    WHERE company_number = ${companyNumber}
  `;
  return { officers: snapshots.length, changes };
}

function officerKey(officer: OfficerItem) {
  const link = officer.links?.officer?.appointments || "";
  const match = link.match(/\/officers\/([^/]+)\/appointments/);
  if (match) return decodeURIComponent(match[1]);
  return sha1(`${clean(officer.name).toLowerCase()}|${clean(officer.officer_role).toLowerCase()}|${clean(officer.appointed_on)}`);
}

function officerSnapshot(companyNumber: string, officer: OfficerItem): OfficerSnapshot {
  return {
    companyNumber,
    officerKey: officerKey(officer),
    officerName: clean(officer.name) || "Unknown officer",
    officerRole: clean(officer.officer_role) || null,
    appointedOn: clean(officer.appointed_on) || null,
    resignedOn: clean(officer.resigned_on) || null,
    occupation: clean(officer.occupation) || null,
    nationality: clean(officer.nationality) || null,
    countryOfResidence: clean(officer.country_of_residence) || null,
    dobMonth: officer.date_of_birth?.month || null,
    dobYear: officer.date_of_birth?.year || null,
    address: formatAddress(officer.address) || null,
    addressJson: officer.address || null,
    identityVerified: officer.identity_verification_status ? officer.identity_verification_status === "verified" : null,
  };
}

async function recordOfficerChanges(
  sql: Sql,
  companyNumber: string,
  oldRows: OfficerRow[],
  snapshots: OfficerSnapshot[],
) {
  const oldByKey = new Map(oldRows.map((row) => [rowKey(row), row]));
  const newByKey = new Map(snapshots.map((row) => [row.officerKey, row]));
  let changes = 0;

  for (const officer of snapshots) {
    const old = oldByKey.get(officer.officerKey);
    if (!old) {
      if (isActiveDirector(officer)) {
        changes += await insertDirectorChange(sql, {
          companyNumber,
          officerKey: officer.officerKey,
          officerName: officer.officerName,
          officerRole: officer.officerRole,
          changeType: "appointed",
          detail: {
            appointed_on: officer.appointedOn,
            role: officer.officerRole,
          },
        });
      }
      continue;
    }

    const oldResigned = valueOf(old.resigned_on);
    if (!oldResigned && officer.resignedOn && isDirectorRole(officer.officerRole || valueOf(old.officer_role))) {
      changes += await insertDirectorChange(sql, {
        companyNumber,
        officerKey: officer.officerKey,
        officerName: officer.officerName,
        officerRole: officer.officerRole,
        changeType: "removed",
        detail: {
          resigned_on: officer.resignedOn,
          previous_role: valueOf(old.officer_role),
        },
      });
      continue;
    }

    const detail = changedFields(old, officer);
    if (Object.keys(detail).length && isDirectorRole(officer.officerRole || valueOf(old.officer_role))) {
      changes += await insertDirectorChange(sql, {
        companyNumber,
        officerKey: officer.officerKey,
        officerName: officer.officerName,
        officerRole: officer.officerRole,
        changeType: "changed",
        detail,
      });
    }
  }

  for (const old of oldRows) {
    const key = rowKey(old);
    if (newByKey.has(key)) continue;
    const role = valueOf(old.officer_role);
    if (!isDirectorRole(role)) continue;
    changes += await insertDirectorChange(sql, {
      companyNumber,
      officerKey: key,
      officerName: valueOf(old.officer_name) || "Unknown officer",
      officerRole: role || null,
      changeType: "removed",
      detail: { note: "Officer no longer returned by Companies House officers API" },
    });
  }

  return changes;
}

async function insertDirectorChange(
  sql: Sql,
  change: {
    companyNumber: string;
    officerKey: string;
    officerName: string;
    officerRole: string | null;
    changeType: "appointed" | "removed" | "changed";
    detail: Record<string, unknown>;
  },
) {
  const fingerprint = sha1(
    `${change.companyNumber}|${change.officerKey}|${change.changeType}|${JSON.stringify(change.detail)}`,
  );
  const inserted = (await sql`
    INSERT INTO director_changes (
      company_number, officer_key, officer_name, officer_role, change_type, detail, fingerprint
    )
    VALUES (
      ${change.companyNumber}, ${change.officerKey}, ${change.officerName}, ${change.officerRole},
      ${change.changeType}, ${JSON.stringify(change.detail)}::jsonb, ${fingerprint}
    )
    ON CONFLICT (fingerprint) DO NOTHING
    RETURNING id
  `) as DbRow[];
  return inserted.length ? 1 : 0;
}

function rowKey(row: OfficerRow) {
  const name = valueOf(row.officer_name) || "";
  const role = valueOf(row.officer_role) || "";
  const appointedOn = valueOf(row.appointed_on) || "";
  return (
    valueOf(row.officer_key) ||
    sha1(`${name.toLowerCase()}|${role.toLowerCase()}|${appointedOn}`)
  );
}

function changedFields(old: OfficerRow, next: OfficerSnapshot) {
  const fields: Record<string, { from: string | null; to: string | null }> = {};
  addChange(fields, "role", valueOf(old.officer_role), next.officerRole);
  addChange(fields, "appointed_on", valueOf(old.appointed_on), next.appointedOn);
  addChange(fields, "occupation", valueOf(old.occupation), next.occupation);
  addChange(fields, "nationality", valueOf(old.nationality), next.nationality);
  addChange(fields, "country_of_residence", valueOf(old.country_of_residence), next.countryOfResidence);
  addChange(fields, "address", valueOf(old.address), next.address);
  addChange(fields, "identity_verified", valueOf(old.identity_verified), next.identityVerified === null ? null : String(next.identityVerified));
  return fields;
}

function addChange(
  fields: Record<string, { from: string | null; to: string | null }>,
  key: string,
  from: string | null,
  to: string | null,
) {
  if ((from || null) !== (to || null)) fields[key] = { from: from || null, to: to || null };
}

function isActiveDirector(officer: OfficerSnapshot) {
  return !officer.resignedOn && isDirectorRole(officer.officerRole);
}

function isDirectorRole(role: string | null) {
  return Boolean(role && role.toLowerCase().includes("director"));
}

function valueOf(value: unknown) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return clean(String(value)) || null;
}
