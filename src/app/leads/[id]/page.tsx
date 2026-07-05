import {
  Activity,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Home,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  type LucideIcon,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { scoreContact } from "@/lib/contact-quality";
import { ensureSchema, getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

type DbRow = Record<string, unknown>;

type Lead = {
  id: number;
  organisationName: string;
  town: string | null;
  county: string | null;
  licenceTypes: string | null;
  routes: string | null;
  removedOn: string | null;
  detectedAt: string | null;
  sourceUrl: string | null;
  matchStatus: string | null;
  matchNotes: string | null;
  companyNumber: string | null;
  companyName: string | null;
  companyStatus: string | null;
  incorporationDate: string | null;
  companyType: string | null;
  address: string | null;
  websiteUrl: string | null;
  websiteStatus: string | null;
  websiteNotes: string | null;
  enrichedAt: string | null;
  directors: number;
  contacts: number;
  changes: number;
};

type Officer = {
  id: number;
  officerName: string;
  officerRole: string | null;
  appointedOn: string | null;
  resignedOn: string | null;
  occupation: string | null;
  nationality: string | null;
  countryOfResidence: string | null;
};

type Change = {
  id: number;
  officerName: string;
  officerRole: string | null;
  changeType: string;
  observedAt: string;
};

type Contact = {
  id: number;
  contactType: string;
  value: string;
  sourceUrl: string;
  scrapedAt: string;
  qualityScore: number;
  qualityLabel: "high" | "medium" | "low";
  qualityReason: string;
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isFinite(leadId)) notFound();

  const data = await loadLead(leadId);
  if (!data) notFound();
  const { lead, officers, changes, contacts } = data;
  const pipeline = leadPipeline(lead);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Image alt="CH Watch" className="h-11 w-11 shrink-0" height="44" src="/brand-mark.svg" width="44" />
            <div>
              <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#007aff] hover:underline" href="/">
                <ArrowLeft className="h-4 w-4" />
                Back to leads
              </Link>
              <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{lead.organisationName}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {lead.websiteUrl ? (
              <a className="nav-link inline-flex items-center gap-2" href={lead.websiteUrl} rel="noreferrer" target="_blank">
                <Globe2 className="h-4 w-4" />
                Website
              </a>
            ) : null}
            {lead.companyNumber ? (
              <a
                className="nav-link inline-flex items-center gap-2"
                href={`https://find-and-update.company-information.service.gov.uk/company/${lead.companyNumber}`}
                rel="noreferrer"
                target="_blank"
              >
                <Building2 className="h-4 w-4" />
                Companies House
              </a>
            ) : null}
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Status label={pipeline.label} tone={pipeline.tone} />
                  <Status label={`removed ${formatDate(lead.removedOn)}`} tone="red" />
                </div>
                <h2 className="mt-4 text-2xl font-semibold">{lead.companyName || "Company match pending"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#6e6e73]">{lead.matchNotes || lead.matchStatus || "No matching notes yet."}</p>
              </div>
              {contacts.length ? <QualityBadge label={bestContact(contacts).qualityLabel} score={bestContact(contacts).qualityScore} /> : null}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MiniStat icon={Mail} label="Contacts" value={formatNumber(lead.contacts)} />
              <MiniStat icon={Users} label="Directors" value={formatNumber(lead.directors)} />
              <MiniStat icon={ShieldAlert} label="Changes" value={formatNumber(lead.changes)} />
            </div>
          </article>

          <article className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Company profile</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <DetailLine icon={Building2} label="Number" value={lead.companyNumber || "Not matched"} />
              <DetailLine icon={CheckCircle2} label="Status" value={lead.companyStatus || lead.matchStatus || "Pending"} />
              <DetailLine icon={Home} label="Type" value={lead.companyType || "Not known"} />
              <DetailLine icon={MapPin} label="Address" value={lead.address || [lead.town, lead.county].filter(Boolean).join(", ") || "Not known"} />
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-2xl border border-black/10 bg-white shadow-sm">
            <SectionHead icon={Phone} title="Contact Details" right={`${contacts.length} found`} />
            <div className="divide-y divide-black/10">
              {contacts.map((contact) => (
                <div key={contact.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-semibold">
                      {contact.contactType === "email" ? <Mail className="h-4 w-4 text-[#af52de]" /> : <Phone className="h-4 w-4 text-[#34c759]" />}
                      <span className="break-all">{contact.value}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#6e6e73]">{contact.qualityReason}</p>
                    <a className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-[#007aff] hover:underline" href={contact.sourceUrl} rel="noreferrer" target="_blank">
                      {host(contact.sourceUrl)}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <QualityBadge label={contact.qualityLabel} score={contact.qualityScore} />
                </div>
              ))}
              {!contacts.length ? <EmptyLine text="No public contact details scraped yet." /> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-black/10 bg-white shadow-sm">
            <SectionHead icon={ShieldAlert} title="Sponsor Removal" right={formatDate(lead.removedOn)} />
            <div className="grid gap-3 p-4 text-sm">
              <DetailLine icon={MapPin} label="Location" value={[lead.town, lead.county].filter(Boolean).join(", ") || "Not known"} />
              <DetailLine icon={ShieldAlert} label="Licence routes" value={lead.routes || lead.licenceTypes || "Not known"} />
              <DetailLine icon={Activity} label="Detected" value={formatDateTime(lead.detectedAt)} />
              {lead.sourceUrl ? (
                <a className="inline-flex items-center gap-2 text-sm font-semibold text-[#007aff] hover:underline" href={lead.sourceUrl} rel="noreferrer" target="_blank">
                  Source update
                  <ExternalLink className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-black/10 bg-white shadow-sm">
            <SectionHead icon={Users} title="Directors / Officers" right={`${officers.length} shown`} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-y border-black/10 bg-[#fbfbfd] text-xs font-semibold uppercase text-[#6e6e73]">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Appointed</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {officers.map((officer) => (
                    <tr key={officer.id}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{officer.officerName}</p>
                        <p className="mt-1 text-xs text-[#6e6e73]">{[officer.occupation, officer.nationality, officer.countryOfResidence].filter(Boolean).join(" | ")}</p>
                      </td>
                      <td className="px-4 py-3 text-[#6e6e73]">{officer.officerRole || "Officer"}</td>
                      <td className="px-4 py-3 text-[#6e6e73]">{formatDate(officer.appointedOn)}</td>
                      <td className="px-4 py-3">
                        {officer.resignedOn ? <Status label={`resigned ${formatDate(officer.resignedOn)}`} tone="amber" /> : <Status label="active" tone="green" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!officers.length ? <EmptyLine text="No directors/officers synced yet." /> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-black/10 bg-white shadow-sm">
            <SectionHead icon={ShieldAlert} title="Director Changes" right={`${changes.length} total`} />
            <div className="divide-y divide-black/10">
              {changes.map((change) => (
                <div key={change.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{change.officerName}</p>
                      <p className="mt-1 text-xs text-[#6e6e73]">{change.officerRole || "Officer"}</p>
                    </div>
                    <Status label={change.changeType} tone={changeTone(change.changeType)} />
                  </div>
                  <p className="mt-2 text-xs text-[#6e6e73]">{formatDateTime(change.observedAt)}</p>
                </div>
              ))}
              {!changes.length ? <EmptyLine text="No director changes after baseline yet." /> : null}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

async function loadLead(id: number) {
  await ensureSchema();
  const sql = getSql();
  const leadRows = (await sql`
    SELECT sr.id, sr.organisation_name, sr.town, sr.county, sr.licence_types, sr.routes,
           sr.removed_on, sr.detected_at, sr.source_url, sr.match_status, sr.match_notes,
           sr.company_number, sr.enriched_at, c.company_name, c.status_detail,
           c.incorporation_date, c.company_type, c.registered_office_address,
           c.website_url, c.website_discovery_status, c.website_discovery_notes,
           COALESCE((SELECT COUNT(*) FROM officers o WHERE o.company_number = sr.company_number AND o.resigned_on IS NULL AND lower(o.officer_role) LIKE '%director%'), 0) AS directors,
           COALESCE((SELECT COUNT(*) FROM scraped_contacts sc WHERE sc.company_number = sr.company_number), 0) AS contacts,
           COALESCE((SELECT COUNT(*) FROM director_changes dc WHERE dc.company_number = sr.company_number), 0) AS changes
    FROM sponsor_removed sr
    LEFT JOIN companies c ON c.company_number = sr.company_number
    WHERE sr.id = ${id}
    LIMIT 1
  `) as DbRow[];
  if (!leadRows.length) return null;
  const row = leadRows[0];
  const lead: Lead = {
    id: num(row.id),
    organisationName: String(row.organisation_name || ""),
    town: nullable(row.town),
    county: nullable(row.county),
    licenceTypes: nullable(row.licence_types),
    routes: nullable(row.routes),
    removedOn: nullable(row.removed_on),
    detectedAt: nullable(row.detected_at),
    sourceUrl: nullable(row.source_url),
    matchStatus: nullable(row.match_status),
    matchNotes: nullable(row.match_notes),
    companyNumber: nullable(row.company_number),
    companyName: nullable(row.company_name),
    companyStatus: nullable(row.status_detail),
    incorporationDate: nullable(row.incorporation_date),
    companyType: nullable(row.company_type),
    address: nullable(row.registered_office_address),
    websiteUrl: nullable(row.website_url),
    websiteStatus: nullable(row.website_discovery_status),
    websiteNotes: nullable(row.website_discovery_notes),
    enrichedAt: nullable(row.enriched_at),
    directors: num(row.directors),
    contacts: num(row.contacts),
    changes: num(row.changes),
  };

  if (!lead.companyNumber) return { lead, officers: [] as Officer[], changes: [] as Change[], contacts: [] as Contact[] };

  const [officerRows, changeRows, contactRows] = await Promise.all([
    sql`
      SELECT id, officer_name, officer_role, appointed_on, resigned_on, occupation, nationality, country_of_residence
      FROM officers
      WHERE company_number = ${lead.companyNumber}
      ORDER BY resigned_on ASC NULLS FIRST, appointed_on DESC NULLS LAST, officer_name ASC
      LIMIT 80
    `,
    sql`
      SELECT id, officer_name, officer_role, change_type, observed_at
      FROM director_changes
      WHERE company_number = ${lead.companyNumber}
      ORDER BY observed_at DESC, id DESC
      LIMIT 30
    `,
    sql`
      SELECT id, contact_type, value, source_url, scraped_at, quality_score, quality_label, quality_reason
      FROM scraped_contacts
      WHERE company_number = ${lead.companyNumber}
      ORDER BY quality_score DESC NULLS LAST, scraped_at DESC
      LIMIT 40
    `,
  ]);

  return {
    lead,
    officers: (officerRows as DbRow[]).map((item) => ({
      id: num(item.id),
      officerName: String(item.officer_name || ""),
      officerRole: nullable(item.officer_role),
      appointedOn: nullable(item.appointed_on),
      resignedOn: nullable(item.resigned_on),
      occupation: nullable(item.occupation),
      nationality: nullable(item.nationality),
      countryOfResidence: nullable(item.country_of_residence),
    })),
    changes: (changeRows as DbRow[]).map((item) => ({
      id: num(item.id),
      officerName: String(item.officer_name || ""),
      officerRole: nullable(item.officer_role),
      changeType: String(item.change_type || ""),
      observedAt: String(item.observed_at || ""),
    })),
    contacts: (contactRows as DbRow[]).map((item) => {
      const contactType = String(item.contact_type || "");
      const value = String(item.value || "");
      const sourceUrl = String(item.source_url || "");
      const fallback = scoreContact({ contactType, value, sourceUrl, websiteUrl: lead.websiteUrl });
      const score = num(item.quality_score) || fallback.score;
      return {
        id: num(item.id),
        contactType,
        value,
        sourceUrl,
        scrapedAt: String(item.scraped_at || ""),
        qualityScore: score,
        qualityLabel: qualityLabel(score),
        qualityReason: String(item.quality_reason || fallback.reason),
      };
    }),
  };
}

function SectionHead({ icon: Icon, title, right }: { icon: LucideIcon; title: string; right: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#6e6e73]" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <span className="text-xs font-medium text-[#6e6e73]">{right}</span>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-[#fbfbfd] p-3">
      <Icon className="h-4 w-4 text-[#6e6e73]" />
      <p className="mt-2 text-xs font-medium text-[#6e6e73]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function DetailLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[20px_90px_1fr] gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-[#6e6e73]" />
      <span className="font-medium text-[#6e6e73]">{label}</span>
      <span className="break-words font-semibold">{value}</span>
    </div>
  );
}

function Status({ label, tone }: { label: string; tone: "green" | "amber" | "red" | "blue" | "purple" }) {
  const tones = {
    green: "bg-[#e7f8ed] text-[#177d35]",
    amber: "bg-[#fff3df] text-[#9a5b00]",
    red: "bg-[#ffecea] text-[#b42318]",
    blue: "bg-[#eaf3ff] text-[#0057d9]",
    purple: "bg-[#f4eaff] text-[#7a2bbf]",
  };
  return <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{label}</span>;
}

function QualityBadge({ label, score }: { label: "high" | "medium" | "low"; score: number }) {
  const tone = label === "high" ? "green" : label === "medium" ? "blue" : "amber";
  return <Status label={`${label} ${score || 0}`} tone={tone} />;
}

function EmptyLine({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-[#6e6e73]">{text}</div>;
}

function leadPipeline(lead: Lead): { label: string; tone: "green" | "amber" | "red" | "blue" | "purple" } {
  if (lead.contacts > 0) return { label: "ready", tone: "green" };
  if (lead.websiteUrl) return { label: "website found", tone: "blue" };
  if (lead.directors > 0) return { label: "directors found", tone: "purple" };
  if (lead.companyNumber) return { label: "company matched", tone: "blue" };
  if (lead.enrichedAt) return { label: "unmatched", tone: "red" };
  return { label: "imported", tone: "amber" };
}

function bestContact(contacts: Contact[]) {
  return contacts.reduce((best, item) => (item.qualityScore > best.qualityScore ? item : best), contacts[0]);
}

function nullable(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatDate(value: string | null) {
  if (!value) return "Not known";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not known";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function host(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function changeTone(change: string): "green" | "amber" | "red" | "blue" | "purple" {
  if (change === "appointed") return "green";
  if (change === "removed") return "red";
  if (change === "changed") return "amber";
  return "blue";
}

function qualityLabel(score: number): "high" | "medium" | "low" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}
