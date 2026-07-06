import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  ExternalLink,
  Filter,
  Globe2,
  LogOut,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  type LucideIcon,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { scoreContact } from "@/lib/contact-quality";
import { MIN_EVENT_DATE } from "@/lib/config";
import { ensureSchema, getSql, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type Filters = {
  q: string;
  pipeline: string;
  contact: string;
  sort: string;
};

type Summary = {
  removals: number;
  matched: number;
  companies: number;
  withWebsite: number;
  contacts: number;
  pendingEnrich: number;
  directorChanges: number;
  readyLeads: number;
  unmatched: number;
};

type RemovalRow = {
  id: number;
  organisation_name: string;
  town: string | null;
  county: string | null;
  removed_on: string | null;
  match_status: string | null;
  company_number: string | null;
  company_name: string | null;
  website_url: string | null;
  enriched_at: string | null;
  directors: number;
  contacts: number;
  high_quality_contacts: number;
  best_contact_score: number;
  has_changes: boolean;
};

type ChangeRow = {
  id: number;
  company_name: string | null;
  company_number: string;
  officer_name: string;
  officer_role: string | null;
  change_type: string;
  observed_at: string;
};

type ContactRow = {
  id: number;
  company_name: string | null;
  company_number: string;
  contact_type: string;
  value: string;
  source_url: string;
  scraped_at: string;
  quality_score: number;
  quality_label: "high" | "medium" | "low";
  quality_reason: string;
};

type RunRow = {
  id: number;
  kind: string;
  started_at: string;
  finished_at: string | null;
  processed: number | null;
  created: number | null;
  updated: number | null;
  error: string | null;
};

type DbRow = Record<string, unknown>;

type DashboardData =
  | {
      ready: false;
      error?: string;
      missing: string[];
    }
  | {
      ready: true;
      summary: Summary;
      totalFiltered: number;
      removals: RemovalRow[];
      changes: ChangeRow[];
      contacts: ContactRow[];
      runs: RunRow[];
    };

export default async function Home({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) || {};
  const filters = parseFilters(params);
  const data = await loadDashboard(filters);

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Image alt="CW Watch" className="h-12 w-12 shrink-0" height="48" src="/brand-mark.png" width="48" />
              <div>
                <h1 className="text-4xl font-semibold text-[#1d1d1f] sm:text-5xl">CW Watch</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#6e6e73]">
              <ShieldAlert className="h-4 w-4 text-[#ff3b30]" />
              <span>Sponsor licence removals from {formatShortDate(MIN_EVENT_DATE)}</span>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <a className="nav-link" href="#leads">
              Leads
            </a>
            <a className="nav-link" href="#directors">
              Directors
            </a>
            <a className="nav-link" href="#contacts">
              Contacts
            </a>
            <Link className="nav-link" href="/api/health">
              Health
            </Link>
            <Link className="nav-link inline-flex items-center gap-2" href="/logout">
              <LogOut className="h-4 w-4" />
              Sign out
            </Link>
          </nav>
        </header>

        <RunNotice error={single(params.error)} ran={single(params.ran)} />
        {!data.ready ? <SetupState data={data} /> : <Dashboard data={data} filters={filters} />}
      </div>
    </main>
  );
}

function Dashboard({ data, filters }: { data: Extract<DashboardData, { ready: true }>; filters: Filters }) {
  const stats = [
    {
      label: "Removed sponsors",
      value: data.summary.removals,
      helper: "2026 base imported",
      icon: ShieldAlert,
      color: "text-[#ff3b30]",
    },
    {
      label: "Ready leads",
      value: data.summary.readyLeads,
      helper: "Have contact details",
      icon: CheckCircle2,
      color: "text-[#34c759]",
    },
    {
      label: "Matched companies",
      value: data.summary.matched,
      helper: `${data.summary.pendingEnrich} waiting`,
      icon: Building2,
      color: "text-[#007aff]",
    },
    {
      label: "Websites found",
      value: data.summary.withWebsite,
      helper: "Used for scraping",
      icon: Globe2,
      color: "text-[#34c759]",
    },
    {
      label: "Contacts saved",
      value: data.summary.contacts,
      helper: "Emails and phones",
      icon: Mail,
      color: "text-[#af52de]",
    },
    {
      label: "Director changes",
      value: data.summary.directorChanges,
      helper: "After baseline sync",
      icon: Users,
      color: "text-[#ff9500]",
    },
  ];

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#6e6e73]">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold">{formatNumber(stat.value)}</p>
              </div>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-3 text-sm text-[#6e6e73]">{stat.helper}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 rounded-xl border border-black/10 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
        <form action="/api/admin/run" className="flex flex-wrap gap-2" method="post">
          <JobButton icon={RefreshCw} label="Import removals" value="sponsor-backfill" />
          <JobButton icon={Building2} label="Match companies" value="sponsor-enrich" />
          <JobButton icon={Users} label="Check directors" value="director-monitor" />
          <JobButton icon={Globe2} label="Find websites" value="website-discover" />
          <JobButton icon={Mail} label="Scrape contacts" value="contact-scrape" />
        </form>
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-4 text-sm font-semibold text-white transition hover:bg-black"
          href="/api/export/ready-leads"
        >
          <Download className="h-4 w-4" />
          Export ready leads
        </Link>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-4 shadow-sm" id="leads">
        <form className="grid gap-3 lg:grid-cols-[1fr_180px_170px_170px_auto]" method="get">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-[#fbfbfd] px-3 text-sm font-medium text-[#6e6e73] focus-within:border-[#007aff] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#007aff]/10">
            <Search className="h-4 w-4" />
            <input
              className="min-w-0 flex-1 bg-transparent text-[#1d1d1f] outline-none placeholder:text-[#86868b]"
              defaultValue={filters.q}
              name="q"
              placeholder="Search company, town, number"
            />
          </label>
          <SelectFilter label="Pipeline" name="pipeline" value={filters.pipeline}>
            <option value="all">All pipeline</option>
            <option value="ready">Ready leads</option>
            <option value="changed">Director changed</option>
            <option value="no-contacts">No contacts</option>
            <option value="no-website">No website</option>
            <option value="unmatched">Unmatched</option>
            <option value="pending">Pending match</option>
            <option value="matched">Matched</option>
          </SelectFilter>
          <SelectFilter label="Contact" name="contact" value={filters.contact}>
            <option value="any">Any contact</option>
            <option value="email">Has email</option>
            <option value="phone">Has phone</option>
            <option value="none">No contact</option>
          </SelectFilter>
          <SelectFilter label="Sort" name="sort" value={filters.sort}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="contacts">Most contacts</option>
          </SelectFilter>
          <div className="flex gap-2">
            <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#007aff] px-4 text-sm font-semibold text-white transition hover:bg-[#0067d6]">
              <Filter className="h-4 w-4" />
              Apply
            </button>
            <Link className="inline-flex h-11 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-semibold" href="/">
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <div className="rounded-xl border border-black/10 bg-white shadow-sm">
          <SectionHead icon={ShieldAlert} title="Lead Pipeline" right={`${formatNumber(data.totalFiltered)} matching`} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-y border-black/10 bg-[#fbfbfd] text-xs font-semibold uppercase text-[#6e6e73]">
                <tr>
                  <th className="px-4 py-3">Organisation</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Pipeline</th>
                  <th className="px-4 py-3">Contacts</th>
                  <th className="px-4 py-3">Removed</th>
                  <th className="px-4 py-3">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {data.removals.map((row) => (
                  <tr key={row.id} className="align-top transition hover:bg-[#fbfbfd]">
                    <td className="px-4 py-3">
                      <Link className="font-semibold text-[#1d1d1f] hover:text-[#007aff]" href={`/leads/${row.id}`}>
                        {row.organisation_name}
                      </Link>
                      <div className="mt-1 text-xs text-[#6e6e73]">{[row.town, row.county].filter(Boolean).join(", ") || "No location"}</div>
                    </td>
                    <td className="px-4 py-3">
                      {row.company_number ? (
                        <>
                          <a
                            className="font-medium text-[#007aff] hover:underline"
                            href={`https://find-and-update.company-information.service.gov.uk/company/${row.company_number}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {row.company_number}
                          </a>
                          <div className="mt-1 max-w-xs text-xs text-[#6e6e73]">{row.company_name || row.match_status}</div>
                          {row.website_url ? (
                            <a className="mt-1 block truncate text-xs text-[#34c759] hover:underline" href={row.website_url} rel="noreferrer" target="_blank">
                              {host(row.website_url)}
                            </a>
                          ) : null}
                        </>
                      ) : (
                        <Status label={row.match_status || "pending"} tone={row.enriched_at ? "red" : "amber"} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PipelineBadge row={row} />
                      {row.has_changes ? <div className="mt-2 text-xs font-semibold text-[#ff9500]">director change</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.contacts > 0 ? <CheckCircle2 className="h-4 w-4 text-[#34c759]" /> : <Clock3 className="h-4 w-4 text-[#ff9500]" />}
                        <span className="font-semibold">{formatNumber(row.contacts)}</span>
                      </div>
                      {row.contacts > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <QualityBadge label={row.high_quality_contacts > 0 ? "high" : qualityLabel(row.best_contact_score)} score={row.best_contact_score} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#6e6e73]">{formatDate(row.removed_on)}</td>
                    <td className="px-4 py-3">
                      <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[#007aff] hover:underline" href={`/leads/${row.id}`}>
                        View
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.removals.length ? <EmptyLine text="No leads match this filter." /> : null}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-black/10 bg-white shadow-sm" id="directors">
            <SectionHead icon={Users} title="Director / Admin Changes" right={`${data.changes.length} latest`} />
            <div className="divide-y divide-black/10">
              {data.changes.map((row) => (
                <article key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.officer_name}</p>
                      <p className="mt-1 text-xs text-[#6e6e73]">{row.company_name || row.company_number}</p>
                      {row.officer_role ? <p className="mt-1 text-xs text-[#6e6e73]">{row.officer_role}</p> : null}
                    </div>
                    <Status label={row.change_type} tone={changeTone(row.change_type)} />
                  </div>
                  <p className="mt-2 text-xs text-[#6e6e73]">{formatDateTime(row.observed_at)}</p>
                </article>
              ))}
              {!data.changes.length ? <EmptyLine text="No director changes after baseline yet." /> : null}
            </div>
          </div>

          <div className="rounded-xl border border-black/10 bg-white shadow-sm" id="contacts">
            <SectionHead icon={Phone} title="Recent Contacts" right={`${data.contacts.length} latest`} />
            <div className="divide-y divide-black/10">
              {data.contacts.map((row) => (
                <article key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {row.contact_type === "email" ? <Mail className="h-4 w-4 shrink-0 text-[#af52de]" /> : <Phone className="h-4 w-4 shrink-0 text-[#34c759]" />}
                        <span className="break-all">{row.value}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#6e6e73]">{row.company_name || row.company_number}</p>
                      <a className="mt-1 block truncate text-xs text-[#007aff] hover:underline" href={row.source_url} rel="noreferrer" target="_blank">
                        {host(row.source_url)}
                      </a>
                    </div>
                    <QualityBadge label={row.quality_label} score={row.quality_score} />
                  </div>
                </article>
              ))}
              {!data.contacts.length ? <EmptyLine text="No contacts scraped yet." /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-black/10 bg-white shadow-sm">
        <SectionHead icon={Activity} title="Cron Runs" right="latest activity" />
        <div className="grid divide-y divide-black/10 md:grid-cols-2 md:divide-x md:divide-y-0 lg:grid-cols-4">
          {data.runs.map((row) => (
            <article key={row.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{jobLabel(row.kind)}</p>
                  <p className="mt-1 text-xs text-[#6e6e73]">{formatDateTime(row.started_at)}</p>
                </div>
                {row.error ? <AlertCircle className="h-4 w-4 text-[#ff3b30]" /> : <CheckCircle2 className="h-4 w-4 text-[#34c759]" />}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#6e6e73]">
                <Metric label="done" value={row.processed} />
                <Metric label="new" value={row.created} />
                <Metric label="updated" value={row.updated} />
              </div>
              {row.error ? <p className="mt-3 text-xs text-[#ff3b30]">{row.error}</p> : null}
            </article>
          ))}
          {!data.runs.length ? <EmptyLine text="No cron has run yet." /> : null}
        </div>
      </section>
    </>
  );
}

function SetupState({ data }: { data: Extract<DashboardData, { ready: false }> }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <Database className="mt-1 h-5 w-5 text-[#007aff]" />
        <div>
          <h2 className="text-xl font-semibold">Setup needed</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6e6e73]">
            Add the missing Vercel environment variables, then redeploy. The database tables are created automatically on first load.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.missing.map((item) => (
              <span key={item} className="rounded-md border border-black/10 bg-[#f5f5f7] px-3 py-1 text-sm font-medium">
                {item}
              </span>
            ))}
          </div>
          {data.error ? <p className="mt-4 text-sm text-[#ff3b30]">{data.error}</p> : null}
        </div>
      </div>
    </section>
  );
}

function RunNotice({ ran, error }: { ran?: string; error?: string }) {
  if (!ran && !error) return null;
  return (
    <div className={`rounded-xl border p-3 text-sm font-medium ${error ? "border-[#ff3b30]/20 bg-[#fff2f0] text-[#b42318]" : "border-[#34c759]/20 bg-[#eefbf3] text-[#177d35]"}`}>
      {error ? `Job reported an error: ${error}` : `${jobLabel(ran || "job")} finished.`}
    </div>
  );
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

function JobButton({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <button
      className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-[#f5f5f7] px-3 text-sm font-semibold text-[#1d1d1f] transition hover:border-[#007aff]/40 hover:bg-white hover:text-[#0057d9]"
      name="job"
      type="submit"
      value={value}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function SelectFilter({ children, label, name, value }: { children: ReactNode; label: string; name: string; value: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-[#6e6e73]">
      {label}
      <select className="h-11 rounded-xl border border-black/10 bg-[#fbfbfd] px-3 text-sm font-semibold text-[#1d1d1f] outline-none focus:border-[#007aff] focus:bg-white focus:ring-4 focus:ring-[#007aff]/10" defaultValue={value} name={name}>
        {children}
      </select>
    </label>
  );
}

function PipelineBadge({ row }: { row: RemovalRow }) {
  const pipeline = leadPipeline(row);
  return <Status label={pipeline.label} tone={pipeline.tone} />;
}

function QualityBadge({ label, score }: { label: "high" | "medium" | "low"; score: number }) {
  const tone = label === "high" ? "green" : label === "medium" ? "blue" : "amber";
  return <Status label={`${label} ${score || 0}`} tone={tone} />;
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

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="font-semibold text-[#1d1d1f]">{formatNumber(value || 0)}</div>
      <div>{label}</div>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-[#6e6e73]">{text}</div>;
}

async function loadDashboard(filters: Filters): Promise<DashboardData> {
  const missing = requiredEnv().filter((name) => !process.env[name]);
  if (!hasDatabase()) return { ready: false, missing: ["DATABASE_URL", ...missing.filter((name) => name !== "DATABASE_URL")] };

  try {
    await ensureSchema();
    const sql = getSql();
    const qLike = `%${filters.q.toLowerCase()}%`;
    const [summaryRowsRaw, filteredRowsRaw, removalRowsRaw, changeRowsRaw, contactRowsRaw, runRowsRaw] = await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*) FROM sponsor_removed WHERE removed_on >= ${MIN_EVENT_DATE}) AS removals,
          (SELECT COUNT(*) FROM sponsor_removed WHERE company_number IS NOT NULL) AS matched,
          (SELECT COUNT(*) FROM companies) AS companies,
          (SELECT COUNT(*) FROM companies WHERE website_url IS NOT NULL AND website_url <> '') AS with_website,
          (SELECT COUNT(*) FROM scraped_contacts) AS contacts,
          (SELECT COUNT(*) FROM sponsor_removed WHERE enriched_at IS NULL) AS pending_enrich,
          (SELECT COUNT(*) FROM sponsor_removed WHERE enriched_at IS NOT NULL AND company_number IS NULL) AS unmatched,
          (SELECT COUNT(*) FROM director_changes) AS director_changes,
          (SELECT COUNT(DISTINCT sr.id) FROM sponsor_removed sr JOIN scraped_contacts sc ON sc.company_number = sr.company_number WHERE sr.removed_on >= ${MIN_EVENT_DATE}) AS ready_leads
      `,
      sql`
        SELECT COUNT(*) AS total
        FROM sponsor_removed sr
        LEFT JOIN companies c ON c.company_number = sr.company_number
        WHERE sr.removed_on >= ${MIN_EVENT_DATE}
          AND (${filters.q === ""} OR lower(concat_ws(' ', sr.organisation_name, sr.town, sr.county, sr.company_number, c.company_name)) LIKE ${qLike})
          AND (${filters.pipeline !== "ready"} OR EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number))
          AND (${filters.pipeline !== "changed"} OR EXISTS(SELECT 1 FROM director_changes dc WHERE dc.company_number = sr.company_number))
          AND (${filters.pipeline !== "no-contacts"} OR (sr.company_number IS NOT NULL AND c.website_url IS NOT NULL AND NOT EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number)))
          AND (${filters.pipeline !== "no-website"} OR (sr.company_number IS NOT NULL AND (c.website_url IS NULL OR c.website_url = '')))
          AND (${filters.pipeline !== "unmatched"} OR (sr.enriched_at IS NOT NULL AND sr.company_number IS NULL))
          AND (${filters.pipeline !== "pending"} OR sr.enriched_at IS NULL)
          AND (${filters.pipeline !== "matched"} OR sr.company_number IS NOT NULL)
          AND (${filters.contact !== "email"} OR EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number AND sc.contact_type = 'email'))
          AND (${filters.contact !== "phone"} OR EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number AND sc.contact_type = 'phone'))
          AND (${filters.contact !== "none"} OR NOT EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number))
      `,
      sql`
        SELECT sr.id, sr.organisation_name, sr.town, sr.county, sr.removed_on, sr.match_status,
               sr.company_number, sr.enriched_at, c.company_name, c.website_url,
               COALESCE((SELECT COUNT(*) FROM officers o WHERE o.company_number = sr.company_number AND o.resigned_on IS NULL AND lower(o.officer_role) LIKE '%director%'), 0) AS directors,
               COALESCE((SELECT COUNT(*) FROM scraped_contacts sc WHERE sc.company_number = sr.company_number), 0) AS contacts,
               COALESCE((SELECT COUNT(*) FROM scraped_contacts sc WHERE sc.company_number = sr.company_number AND sc.quality_label = 'high'), 0) AS high_quality_contacts,
               COALESCE((SELECT MAX(sc.quality_score) FROM scraped_contacts sc WHERE sc.company_number = sr.company_number), 0) AS best_contact_score,
               EXISTS(SELECT 1 FROM director_changes dc WHERE dc.company_number = sr.company_number AND dc.observed_at >= now() - interval '30 days') AS has_changes
        FROM sponsor_removed sr
        LEFT JOIN companies c ON c.company_number = sr.company_number
        WHERE sr.removed_on >= ${MIN_EVENT_DATE}
          AND (${filters.q === ""} OR lower(concat_ws(' ', sr.organisation_name, sr.town, sr.county, sr.company_number, c.company_name)) LIKE ${qLike})
          AND (${filters.pipeline !== "ready"} OR EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number))
          AND (${filters.pipeline !== "changed"} OR EXISTS(SELECT 1 FROM director_changes dc WHERE dc.company_number = sr.company_number))
          AND (${filters.pipeline !== "no-contacts"} OR (sr.company_number IS NOT NULL AND c.website_url IS NOT NULL AND NOT EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number)))
          AND (${filters.pipeline !== "no-website"} OR (sr.company_number IS NOT NULL AND (c.website_url IS NULL OR c.website_url = '')))
          AND (${filters.pipeline !== "unmatched"} OR (sr.enriched_at IS NOT NULL AND sr.company_number IS NULL))
          AND (${filters.pipeline !== "pending"} OR sr.enriched_at IS NULL)
          AND (${filters.pipeline !== "matched"} OR sr.company_number IS NOT NULL)
          AND (${filters.contact !== "email"} OR EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number AND sc.contact_type = 'email'))
          AND (${filters.contact !== "phone"} OR EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number AND sc.contact_type = 'phone'))
          AND (${filters.contact !== "none"} OR NOT EXISTS(SELECT 1 FROM scraped_contacts sc WHERE sc.company_number = sr.company_number))
        ORDER BY
          CASE WHEN ${filters.sort} = 'contacts' THEN COALESCE((SELECT COUNT(*) FROM scraped_contacts sc WHERE sc.company_number = sr.company_number), 0) END DESC,
          CASE WHEN ${filters.sort} = 'oldest' THEN sr.removed_on END ASC NULLS LAST,
          sr.removed_on DESC NULLS LAST,
          sr.id DESC
        LIMIT 25
      `,
      sql`
        SELECT dc.id, dc.company_number, dc.officer_name, dc.officer_role, dc.change_type, dc.observed_at, c.company_name
        FROM director_changes dc
        LEFT JOIN companies c ON c.company_number = dc.company_number
        ORDER BY dc.observed_at DESC, dc.id DESC
        LIMIT 8
      `,
      sql`
        SELECT sc.id, sc.company_number, sc.contact_type, sc.value, sc.source_url, sc.scraped_at,
               sc.quality_score, sc.quality_label, sc.quality_reason, c.company_name, c.website_url
        FROM scraped_contacts sc
        LEFT JOIN companies c ON c.company_number = sc.company_number
        ORDER BY sc.scraped_at DESC, sc.quality_score DESC NULLS LAST, sc.id DESC
        LIMIT 8
      `,
      sql`
        SELECT id, kind, started_at, finished_at, processed, created, updated, error
        FROM runs
        ORDER BY started_at DESC, id DESC
        LIMIT 8
      `,
    ]);

    const summaryRaw = ((summaryRowsRaw as DbRow[])[0] || {}) as DbRow;
    const filteredRaw = ((filteredRowsRaw as DbRow[])[0] || {}) as DbRow;
    return {
      ready: true,
      summary: {
        removals: num(summaryRaw.removals),
        matched: num(summaryRaw.matched),
        companies: num(summaryRaw.companies),
        withWebsite: num(summaryRaw.with_website),
        contacts: num(summaryRaw.contacts),
        pendingEnrich: num(summaryRaw.pending_enrich),
        directorChanges: num(summaryRaw.director_changes),
        readyLeads: num(summaryRaw.ready_leads),
        unmatched: num(summaryRaw.unmatched),
      },
      totalFiltered: num(filteredRaw.total),
      removals: (removalRowsRaw as DbRow[]).map((row) => ({
        id: num(row.id),
        organisation_name: String(row.organisation_name || ""),
        town: nullable(row.town),
        county: nullable(row.county),
        removed_on: nullable(row.removed_on),
        match_status: nullable(row.match_status),
        company_number: nullable(row.company_number),
        company_name: nullable(row.company_name),
        website_url: nullable(row.website_url),
        enriched_at: nullable(row.enriched_at),
        directors: num(row.directors),
        contacts: num(row.contacts),
        high_quality_contacts: num(row.high_quality_contacts),
        best_contact_score: num(row.best_contact_score),
        has_changes: Boolean(row.has_changes),
      })),
      changes: (changeRowsRaw as DbRow[]).map((row) => ({
        id: num(row.id),
        company_name: nullable(row.company_name),
        company_number: String(row.company_number || ""),
        officer_name: String(row.officer_name || ""),
        officer_role: nullable(row.officer_role),
        change_type: String(row.change_type || ""),
        observed_at: String(row.observed_at || ""),
      })),
      contacts: (contactRowsRaw as DbRow[]).map((row) => {
        const contactType = String(row.contact_type || "");
        const value = String(row.value || "");
        const sourceUrl = String(row.source_url || "");
        const fallback = scoreContact({ contactType, value, sourceUrl, websiteUrl: nullable(row.website_url) });
        return {
          id: num(row.id),
          company_name: nullable(row.company_name),
          company_number: String(row.company_number || ""),
          contact_type: contactType,
          value,
          source_url: sourceUrl,
          scraped_at: String(row.scraped_at || ""),
          quality_score: num(row.quality_score) || fallback.score,
          quality_label: qualityLabel(num(row.quality_score) || fallback.score),
          quality_reason: String(row.quality_reason || fallback.reason),
        };
      }),
      runs: (runRowsRaw as DbRow[]).map((row) => ({
        id: num(row.id),
        kind: String(row.kind || ""),
        started_at: String(row.started_at || ""),
        finished_at: nullable(row.finished_at),
        processed: num(row.processed),
        created: num(row.created),
        updated: num(row.updated),
        error: nullable(row.error),
      })),
    };
  } catch (error) {
    return {
      ready: false,
      missing,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseFilters(params: SearchParams): Filters {
  const pipeline = allowed(single(params.pipeline), ["all", "ready", "changed", "no-contacts", "no-website", "unmatched", "pending", "matched"], "all");
  const contact = allowed(single(params.contact), ["any", "email", "phone", "none"], "any");
  const sort = allowed(single(params.sort), ["newest", "oldest", "contacts"], "newest");
  return {
    q: String(single(params.q) || "").trim().slice(0, 80),
    pipeline,
    contact,
    sort,
  };
}

function leadPipeline(row: RemovalRow): { label: string; tone: "green" | "amber" | "red" | "blue" | "purple" } {
  if (row.contacts > 0) return { label: "ready", tone: "green" };
  if (row.website_url) return { label: "website found", tone: "blue" };
  if (row.directors > 0) return { label: "directors found", tone: "purple" };
  if (row.company_number) return { label: "company matched", tone: "blue" };
  if (row.enriched_at) return { label: "unmatched", tone: "red" };
  return { label: "imported", tone: "amber" };
}

function requiredEnv() {
  return ["DATABASE_URL", "COMPANIES_HOUSE_API_KEY", "GROQ_API_KEY", "CRON_SECRET", "APP_USER", "APP_PASSWORD"];
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function allowed<T extends string>(value: string | undefined, allowedValues: T[], fallback: T) {
  return allowedValues.includes(value as T) ? (value as T) : fallback;
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not finished";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
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

function jobLabel(kind: string) {
  return kind
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
