import { NextRequest, NextResponse } from "next/server";
import { scoreContact } from "@/lib/contact-quality";
import { MIN_EVENT_DATE } from "@/lib/config";
import { type DbRow, ensureSchema, getSql } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ExportLead = {
  id: number;
  organisationName: string;
  town: string;
  county: string;
  removedOn: string;
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  address: string;
  website: string;
  directors: number;
  directorChanges: number;
  emails: string[];
  phones: string[];
  sources: Set<string>;
};

export async function GET(request: NextRequest) {
  if (!getSessionFromRequest(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", "/");
    return NextResponse.redirect(loginUrl, 303);
  }

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      sr.id,
      sr.organisation_name,
      sr.town,
      sr.county,
      sr.removed_on,
      c.company_number,
      c.company_name,
      c.status_detail,
      c.registered_office_address,
      c.website_url,
      sc.contact_type,
      sc.value,
      sc.source_url,
      sc.quality_score,
      sc.quality_label,
      sc.quality_reason,
      COALESCE((SELECT COUNT(*) FROM officers o WHERE o.company_number = c.company_number AND o.resigned_on IS NULL AND lower(o.officer_role) LIKE '%director%'), 0) AS directors,
      COALESCE((SELECT COUNT(*) FROM director_changes dc WHERE dc.company_number = c.company_number), 0) AS director_changes
    FROM sponsor_removed sr
    JOIN companies c ON c.company_number = sr.company_number
    JOIN scraped_contacts sc ON sc.company_number = c.company_number
    WHERE sr.removed_on >= ${MIN_EVENT_DATE}
    ORDER BY sr.removed_on DESC NULLS LAST, sr.id DESC, sc.contact_type ASC, sc.quality_score DESC NULLS LAST
    LIMIT 20000
  `) as DbRow[];

  const leads = new Map<number, ExportLead>();
  for (const row of rows) {
    const id = num(row.id);
    const lead =
      leads.get(id) ||
      ({
        id,
        organisationName: String(row.organisation_name || ""),
        town: String(row.town || ""),
        county: String(row.county || ""),
        removedOn: String(row.removed_on || ""),
        companyNumber: String(row.company_number || ""),
        companyName: String(row.company_name || ""),
        companyStatus: String(row.status_detail || ""),
        address: String(row.registered_office_address || ""),
        website: String(row.website_url || ""),
        directors: num(row.directors),
        directorChanges: num(row.director_changes),
        emails: [],
        phones: [],
        sources: new Set<string>(),
      } satisfies ExportLead);
    leads.set(id, lead);

    const contactType = String(row.contact_type || "");
    const value = String(row.value || "");
    const sourceUrl = String(row.source_url || "");
    const fallback = scoreContact({ contactType, value, sourceUrl, websiteUrl: lead.website });
    const label = String(row.quality_label || fallback.label);
    const score = num(row.quality_score) || fallback.score;
    const entry = `${value} (${label}, ${score}/100)`;
    if (contactType === "email") lead.emails.push(entry);
    if (contactType === "phone") lead.phones.push(entry);
    if (sourceUrl) lead.sources.add(sourceUrl);
  }

  const header = [
    "Organisation",
    "Removed on",
    "Town",
    "County",
    "Company number",
    "Company name",
    "Company status",
    "Website",
    "Registered address",
    "Directors",
    "Director changes",
    "Emails",
    "Phones",
    "Contact sources",
  ];
  const lines = [header, ...Array.from(leads.values()).map((lead) => [
    lead.organisationName,
    lead.removedOn,
    lead.town,
    lead.county,
    lead.companyNumber,
    lead.companyName,
    lead.companyStatus,
    lead.website,
    lead.address,
    String(lead.directors),
    String(lead.directorChanges),
    lead.emails.join("; "),
    lead.phones.join("; "),
    Array.from(lead.sources).join("; "),
  ])].map((line) => line.map(csv).join(","));

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Disposition": `attachment; filename="ch-watch-ready-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function csv(value: string) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
