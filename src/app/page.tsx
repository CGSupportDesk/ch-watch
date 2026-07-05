import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  Globe2,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
  type LucideIcon,
  Users,
} from "lucide-react";
import Image from "next/image";
import { MIN_EVENT_DATE } from "@/lib/config";
import { ensureSchema, getSql, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

type Summary = {
  removals: number;
  matched: number;
  companies: number;
  withWebsite: number;
  contacts: number;
  pendingEnrich: number;
  directorChanges: number;
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
  directors: number;
  contacts: number;
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
      removals: RemovalRow[];
      changes: ChangeRow[];
      contacts: ContactRow[];
      runs: RunRow[];
    };

export default async function Home() {
  const data = await loadDashboard();

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Image
                alt="CH Watch"
                className="h-12 w-12 shrink-0"
                height="48"
                src="/brand-mark.svg"
                width="48"
              />
              <div>
                <p className="text-sm font-semibold text-[#6e6e73]">Closing Gap Compliance</p>
                <h1 className="text-4xl font-semibold text-[#1d1d1f] sm:text-5xl">CH Watch</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#6e6e73]">
              <ShieldAlert className="h-4 w-4 text-[#ff3b30]" />
              <span>Sponsor licence removals from {formatShortDate(MIN_EVENT_DATE)}</span>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <a className="nav-link" href="#sponsors">
              Sponsors
            </a>
            <a className="nav-link" href="#directors">
              Directors
            </a>
            <a className="nav-link" href="#contacts">
              Contacts
            </a>
            <a className="nav-link" href="/api/health">
              Health
            </a>
          </nav>
        </header>

        {!data.ready ? <SetupState data={data} /> : <Dashboard data={data} />}
      </div>
    </main>
  );
}

function Dashboard({ data }: { data: Extract<DashboardData, { ready: true }> }) {
  const stats = [
    {
      label: "Removed sponsors",
      value: data.summary.removals,
      helper: "Imported from 2026 history",
      icon: ShieldAlert,
      color: "text-[#ff3b30]",
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
      helper: "Used for contact scrape",
      icon: Globe2,
      color: "text-[#34c759]",
    },
    {
      label: "Contacts saved",
      value: data.summary.contacts,
      helper: "Emails and phone numbers",
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
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
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

      <section className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <form action="/api/admin/run" className="flex flex-wrap gap-2" method="post">
          <JobButton icon={RefreshCw} label="Import removals" value="sponsor-backfill" />
          <JobButton icon={Building2} label="Match companies" value="sponsor-enrich" />
          <JobButton icon={Users} label="Check directors" value="director-monitor" />
          <JobButton icon={Globe2} label="Find websites" value="website-discover" />
          <JobButton icon={Mail} label="Scrape contacts" value="contact-scrape" />
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.7fr_1fr]" id="sponsors">
        <div className="rounded-lg border border-black/10 bg-white shadow-sm">
          <SectionHead
            icon={ShieldAlert}
            title="Removed Sponsors"
            right={`${data.removals.length} latest`}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-y border-black/10 bg-[#fbfbfd] text-xs font-semibold uppercase text-[#6e6e73]">
                <tr>
                  <th className="px-4 py-3">Organisation</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">People</th>
                  <th className="px-4 py-3">Contacts</th>
                  <th className="px-4 py-3">Removed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {data.removals.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#1d1d1f]">{row.organisation_name}</div>
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
                        <Status label={row.match_status || "pending"} tone="amber" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-[#1d1d1f]">
                        <Users className="h-4 w-4 text-[#6e6e73]" />
                        {formatNumber(row.directors)}
                      </div>
                      {row.has_changes ? <div className="mt-1 text-xs font-medium text-[#ff9500]">recent change</div> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.contacts > 0 ? <CheckCircle2 className="h-4 w-4 text-[#34c759]" /> : <Clock3 className="h-4 w-4 text-[#ff9500]" />}
                        <span>{formatNumber(row.contacts)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#6e6e73]">{formatDate(row.removed_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.removals.length ? <EmptyLine text="No 2026 removals imported yet." /> : null}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-black/10 bg-white shadow-sm" id="directors">
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

          <div className="rounded-lg border border-black/10 bg-white shadow-sm" id="contacts">
            <SectionHead icon={Phone} title="Recent Contacts" right={`${data.contacts.length} latest`} />
            <div className="divide-y divide-black/10">
              {data.contacts.map((row) => (
                <article key={row.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {row.contact_type === "email" ? <Mail className="h-4 w-4 text-[#af52de]" /> : <Phone className="h-4 w-4 text-[#34c759]" />}
                    <span className="break-all">{row.value}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#6e6e73]">{row.company_name || row.company_number}</p>
                  <a className="mt-1 block truncate text-xs text-[#007aff] hover:underline" href={row.source_url} rel="noreferrer" target="_blank">
                    {host(row.source_url)}
                  </a>
                </article>
              ))}
              {!data.contacts.length ? <EmptyLine text="No contacts scraped yet." /> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-black/10 bg-white shadow-sm">
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
    <section className="rounded-lg border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <Database className="mt-1 h-5 w-5 text-[#007aff]" />
        <div>
          <h2 className="text-xl font-semibold">Setup Needed</h2>
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

function SectionHead({
  icon: Icon,
  title,
  right,
}: {
  icon: LucideIcon;
  title: string;
  right: string;
}) {
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

function JobButton({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <button
      className="flex items-center gap-2 rounded-md border border-black/10 bg-[#f5f5f7] px-3 py-2 text-sm font-semibold text-[#1d1d1f] transition hover:border-[#007aff]/40 hover:bg-white hover:text-[#0057d9]"
      name="job"
      type="submit"
      value={value}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
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
  return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{label}</span>;
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

async function loadDashboard(): Promise<DashboardData> {
  const missing = requiredEnv().filter((name) => !process.env[name]);
  if (!hasDatabase()) return { ready: false, missing: ["DATABASE_URL", ...missing.filter((name) => name !== "DATABASE_URL")] };

  try {
    await ensureSchema();
    const sql = getSql();
    const [summaryRowsRaw, removalRowsRaw, changeRowsRaw, contactRowsRaw, runRowsRaw] = await Promise.all([
      sql`
        SELECT
          (SELECT COUNT(*) FROM sponsor_removed WHERE removed_on >= ${MIN_EVENT_DATE}) AS removals,
          (SELECT COUNT(*) FROM sponsor_removed WHERE company_number IS NOT NULL) AS matched,
          (SELECT COUNT(*) FROM companies) AS companies,
          (SELECT COUNT(*) FROM companies WHERE website_url IS NOT NULL AND website_url <> '') AS with_website,
          (SELECT COUNT(*) FROM scraped_contacts) AS contacts,
          (SELECT COUNT(*) FROM sponsor_removed WHERE enriched_at IS NULL) AS pending_enrich,
          (SELECT COUNT(*) FROM director_changes) AS director_changes
      `,
      sql`
        SELECT sr.id, sr.organisation_name, sr.town, sr.county, sr.removed_on, sr.match_status,
               sr.company_number, c.company_name, c.website_url,
               COALESCE((SELECT COUNT(*) FROM officers o WHERE o.company_number = sr.company_number AND o.resigned_on IS NULL AND lower(o.officer_role) LIKE '%director%'), 0) AS directors,
               COALESCE((SELECT COUNT(*) FROM scraped_contacts sc WHERE sc.company_number = sr.company_number), 0) AS contacts,
               EXISTS(SELECT 1 FROM director_changes dc WHERE dc.company_number = sr.company_number AND dc.observed_at >= now() - interval '30 days') AS has_changes
        FROM sponsor_removed sr
        LEFT JOIN companies c ON c.company_number = sr.company_number
        WHERE sr.removed_on >= ${MIN_EVENT_DATE}
        ORDER BY sr.removed_on DESC NULLS LAST, sr.id DESC
        LIMIT 20
      `,
      sql`
        SELECT dc.id, dc.company_number, dc.officer_name, dc.officer_role, dc.change_type, dc.observed_at, c.company_name
        FROM director_changes dc
        LEFT JOIN companies c ON c.company_number = dc.company_number
        ORDER BY dc.observed_at DESC, dc.id DESC
        LIMIT 8
      `,
      sql`
        SELECT sc.id, sc.company_number, sc.contact_type, sc.value, sc.source_url, sc.scraped_at, c.company_name
        FROM scraped_contacts sc
        LEFT JOIN companies c ON c.company_number = sc.company_number
        ORDER BY sc.scraped_at DESC, sc.id DESC
        LIMIT 8
      `,
      sql`
        SELECT id, kind, started_at, finished_at, processed, created, updated, error
        FROM runs
        ORDER BY started_at DESC, id DESC
        LIMIT 8
      `,
    ]);

    const summaryRows = summaryRowsRaw as DbRow[];
    const removalRows = removalRowsRaw as DbRow[];
    const changeRows = changeRowsRaw as DbRow[];
    const contactRows = contactRowsRaw as DbRow[];
    const runRows = runRowsRaw as DbRow[];
    const summaryRaw = summaryRows[0] || {};
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
      },
      removals: removalRows.map((row) => ({
        id: num(row.id),
        organisation_name: String(row.organisation_name || ""),
        town: nullable(row.town),
        county: nullable(row.county),
        removed_on: nullable(row.removed_on),
        match_status: nullable(row.match_status),
        company_number: nullable(row.company_number),
        company_name: nullable(row.company_name),
        website_url: nullable(row.website_url),
        directors: num(row.directors),
        contacts: num(row.contacts),
        has_changes: Boolean(row.has_changes),
      })),
      changes: changeRows.map((row) => ({
        id: num(row.id),
        company_name: nullable(row.company_name),
        company_number: String(row.company_number || ""),
        officer_name: String(row.officer_name || ""),
        officer_role: nullable(row.officer_role),
        change_type: String(row.change_type || ""),
        observed_at: String(row.observed_at || ""),
      })),
      contacts: contactRows.map((row) => ({
        id: num(row.id),
        company_name: nullable(row.company_name),
        company_number: String(row.company_number || ""),
        contact_type: String(row.contact_type || ""),
        value: String(row.value || ""),
        source_url: String(row.source_url || ""),
        scraped_at: String(row.scraped_at || ""),
      })),
      runs: runRows.map((row) => ({
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

function requiredEnv() {
  return ["DATABASE_URL", "COMPANIES_HOUSE_API_KEY", "GROQ_API_KEY", "CRON_SECRET", "APP_USER", "APP_PASSWORD"];
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

function jobLabel(kind: string) {
  return kind
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
