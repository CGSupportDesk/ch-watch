import { extractContactsWithGroq, searchPublicContactsWithGroq, cleanEmails, cleanPhones } from "./groq";

export type ScrapeResult = {
  emails: Map<string, string>;
  phones: Map<string, string>;
  pages: Record<string, number | string>;
};

const CONTACT_PATHS = [
  "/",
  "/contact",
  "/contact/",
  "/contact-us",
  "/contact-us/",
  "/contacts",
  "/contacts/",
  "/get-in-touch",
  "/get-in-touch/",
  "/enquiries",
  "/enquiry",
  "/about",
  "/about/",
  "/about-us",
  "/about-us/",
  "/find-us",
  "/locations",
  "/location",
  "/our-locations",
  "/team",
];

const MAX_PAGES_PER_SITE = 12;
const FETCH_TIMEOUT_MS = 12_000;

export async function scrapeWebsite(companyName: string, website: string) {
  const base = normalizeBase(website);
  if (!base) throw new Error("Invalid website URL");
  const urls = unique(CONTACT_PATHS.map((path) => `${base}${path}`));
  const result: ScrapeResult = { emails: new Map(), phones: new Map(), pages: {} };
  const texts: string[] = [];

  for (let index = 0; index < urls.length && index < MAX_PAGES_PER_SITE; index++) {
    const url = urls[index];
    try {
      const res = await fetchPage(url);
      result.pages[url] = res.status;
      if (!res.ok) continue;
      const html = await res.text();
      for (const discovered of discoverContactLinks(base, html)) {
        if (!urls.includes(discovered)) urls.push(discovered);
      }
      const protectedEmails = decodeCloudflareEmails(html);
      const text = htmlToText(`${html} ${protectedEmails.join(" ")}`);
      texts.push(`Source URL: ${url}\n${text}`);
      const found = extractContacts(text + " " + html);
      for (const email of found.emails) result.emails.set(email, url);
      for (const phone of found.phones) result.phones.set(phone, url);
    } catch (error) {
      result.pages[url] = error instanceof Error ? error.message : "error";
    }
  }

  if (process.env.GROQ_API_KEY && texts.length) {
    try {
      const ai = await extractContactsWithGroq({ companyName, website: base, text: texts.join("\n\n---\n\n") });
      for (const email of ai.emails) result.emails.set(email, `${base}/`);
      for (const phone of ai.phones) result.phones.set(phone, `${base}/`);
      result.pages[`${base}/#groq-ai-contact-extract`] = "ai";
    } catch (error) {
      result.pages[`${base}/#groq-ai-contact-extract`] = error instanceof Error ? error.message : "error";
    }
  }

  if (process.env.GROQ_API_KEY && (result.emails.size === 0 || result.phones.size === 0)) {
    try {
      const web = await searchPublicContactsWithGroq({ companyName, website: base });
      if (result.emails.size === 0) {
        for (const email of web.emails) result.emails.set(email.value, email.sourceUrl);
      }
      if (result.phones.size === 0) {
        for (const phone of web.phones) result.phones.set(phone.value, phone.sourceUrl);
      }
      result.pages[`${base}/#groq-web-contact-search`] = "ai-web";
    } catch (error) {
      result.pages[`${base}/#groq-web-contact-search`] = error instanceof Error ? error.message : "error";
    }
  }

  return result;
}

export function extractContacts(text: string) {
  const expanded = `${text} ${deobfuscateEmails(text)} ${decodeHtmlEntities(text)}`;
  const emails = cleanEmails(expanded.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []);
  const rawPhones = [
    ...(expanded.match(/\+44\s?\(?0?\)?\s?\d[\d\s().-]{8,16}/g) || []),
    ...(expanded.match(/\b0\d{2,5}[\s().-]?\d{3,4}[\s().-]?\d{3,4}\b/g) || []),
    ...(expanded.match(/\b0\d{10}\b/g) || []),
  ];
  const phones = cleanPhones(rawPhones);
  return { emails, phones };
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": "ClosingGapCompliance/1.0 (+https://theclosinggap.net)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBase(url: string) {
  const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withScheme);
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

function discoverContactLinks(base: string, html: string) {
  const links: string[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html))) {
    const href = decodeHtmlEntities(match[1] || "").trim();
    const label = htmlToText(match[2] || "");
    if (!isContactish(`${href} ${label}`)) continue;
    const url = sameSiteUrl(base, href);
    if (url) links.push(url);
  }
  return unique(links);
}

function sameSiteUrl(base: string, href: string) {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  try {
    const baseUrl = new URL(base);
    const parsed = new URL(href, `${base}/`);
    if (parsed.hostname.replace(/^www\./, "") !== baseUrl.hostname.replace(/^www\./, "")) return null;
    parsed.hash = "";
    parsed.search = "";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function isContactish(value: string) {
  return /\b(contact|contact-us|contacts|get-in-touch|enquir|inquir|find-us|location|office|about|team|support)\b/i.test(value);
}

function htmlToText(html: string) {
  return decodeHtmlEntities(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/href=["'](mailto:|tel:)([^"']+)["']/gi, " $2 ")
    .replace(/(?:aria-label|title|alt)=["']([^"']+)["']/gi, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deobfuscateEmails(text: string) {
  return text.replace(
    /([a-z0-9._%+-]+)\s*(?:\[|\(|{)?\s*at\s*(?:\]|\)|})?\s*([a-z0-9.-]+?)\s*(?:\[|\(|{)?\s*dot\s*(?:\]|\)|})?\s*([a-z]{2,})(?:\s*(?:\[|\(|{)?\s*dot\s*(?:\]|\)|})?\s*([a-z]{2,}))?/gi,
    (_, local: string, domain: string, tld: string, secondTld: string) => `${local}@${domain}.${tld}${secondTld ? `.${secondTld}` : ""}`,
  );
}

function decodeCloudflareEmails(html: string) {
  const emails: string[] = [];
  for (const match of html.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi)) {
    const hex = match[1];
    const decoded = decodeCloudflareEmail(hex);
    if (decoded) emails.push(decoded);
  }
  return emails;
}

function decodeCloudflareEmail(hex: string) {
  if (!hex || hex.length < 4 || hex.length % 2 !== 0) return null;
  const key = Number.parseInt(hex.slice(0, 2), 16);
  let email = "";
  for (let index = 2; index < hex.length; index += 2) {
    const code = Number.parseInt(hex.slice(index, index + 2), 16) ^ key;
    email += String.fromCharCode(code);
  }
  return email.includes("@") ? email : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, decimal: string) => String.fromCharCode(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&commat;/g, "@")
    .replace(/&period;/g, ".")
    .replace(/&dot;/g, ".");
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}
