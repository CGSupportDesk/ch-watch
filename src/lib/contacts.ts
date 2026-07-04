import { extractContactsWithGroq, cleanEmails, cleanPhones } from "./groq";

export type ScrapeResult = {
  emails: Map<string, string>;
  phones: Map<string, string>;
  pages: Record<string, number | string>;
};

export async function scrapeWebsite(companyName: string, website: string) {
  const base = normalizeBase(website);
  if (!base) throw new Error("Invalid website URL");
  const urls = ["/", "/contact", "/contact-us", "/about", "/about-us"].map((path) => `${base}${path}`);
  const result: ScrapeResult = { emails: new Map(), phones: new Map(), pages: {} };
  const texts: string[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "ClosingGapCompliance/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        cache: "no-store",
      });
      result.pages[url] = res.status;
      if (!res.ok) continue;
      const html = await res.text();
      const text = htmlToText(html);
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

  return result;
}

export function extractContacts(text: string) {
  const emails = cleanEmails(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []);
  const rawPhones = [
    ...(text.match(/\+44\s?\(?0?\)?\s?\d[\d\s-]{8,13}/g) || []),
    ...(text.match(/\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/g) || []),
    ...(text.match(/\b0\d{10}\b/g) || []),
  ];
  const phones = cleanPhones(rawPhones);
  return { emails, phones };
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

function htmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/href=["'](mailto:|tel:)([^"']+)["']/gi, " $2 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
