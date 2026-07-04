import { z } from "zod";

const WebsiteResult = z.object({
  website: z.string().nullable().optional(),
  confidence: z.number().optional().default(0),
  reason: z.string().optional().default(""),
  sources: z.array(z.string()).optional().default([]),
});

const ContactResult = z.object({
  emails: z.array(z.string()).optional().default([]),
  phones: z.array(z.string()).optional().default([]),
});

export async function findOfficialWebsite(input: {
  companyName: string;
  town?: string | null;
  county?: string | null;
  address?: string | null;
}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  const place = [input.town, input.county].filter(Boolean).join(", ") || "unknown";
  const prompt = `Use web search to find the official website for this UK company.

Company name: ${input.companyName}
Town/county from sponsor register: ${place}
Registered office address: ${input.address || "unknown"}

Return JSON only:
{"website":"https://example.co.uk","confidence":0.0,"reason":"short reason","sources":["https://source-url"]}

Rules:
- Return the company's own official homepage only.
- Do not return Companies House, GOV.UK, licensed-sponsors-uk.com, Gazette, LinkedIn, Facebook, Instagram, Google Maps, job boards, directories, data brokers, PDFs, or news pages.
- If you cannot confidently find the official homepage, return {"website":null,"confidence":0,"reason":"not found","sources":[]}.
- Prefer UK business websites matching the company name and location.`;

  const json = await groqChat(key, {
    model: process.env.GROQ_WEB_SEARCH_MODEL || "groq/compound-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_completion_tokens: 500,
  });
  const content = String(json.choices?.[0]?.message?.content || "");
  const parsed = WebsiteResult.safeParse(parseJsonObject(content));
  if (!parsed.success) return { website: null, confidence: 0, reason: "Bad Groq JSON", sources: [] as string[] };
  const website = normalizeOfficialWebsite(parsed.data.website);
  const confidence = Math.max(0, Math.min(1, parsed.data.confidence || 0));
  if (!website || confidence < 0.65) {
    return { website: null, confidence, reason: parsed.data.reason || "No confident official website", sources: parsed.data.sources };
  }
  return { website, confidence, reason: parsed.data.reason, sources: parsed.data.sources };
}

export async function extractContactsWithGroq(input: { companyName: string; website: string; text: string }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { emails: [] as string[], phones: [] as string[] };
  const text = input.text.replace(/\s+/g, " ").slice(0, Number(process.env.GROQ_CONTACT_MAX_CHARS || 8000));
  const json = await groqChat(key, {
    model: process.env.GROQ_CONTACT_MODEL || "openai/gpt-oss-20b",
    messages: [
      {
        role: "system",
        content:
          "Extract only public business contact details from website text. Return strict JSON with keys emails and phones. Do not invent, guess, infer, or include personal contact details.",
      },
      {
        role: "user",
        content: `Company: ${input.companyName}\nWebsite: ${input.website}\nReturn JSON: {"emails":["info@example.co.uk"],"phones":["+441234567890"]}\n\nWebsite text:\n${text}`,
      },
    ],
    temperature: 0,
    max_completion_tokens: 300,
    reasoning_effort: "low",
    response_format: { type: "json_object" },
  });
  const content = String(json.choices?.[0]?.message?.content || "");
  const parsed = ContactResult.safeParse(parseJsonObject(content));
  if (!parsed.success) return { emails: [], phones: [] };
  return {
    emails: cleanEmails(parsed.data.emails),
    phones: cleanPhones(parsed.data.phones),
  };
}

async function groqChat(key: string, payload: Record<string, unknown>) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function normalizeOfficialWebsite(raw: string | null | undefined) {
  if (!raw) return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    "gov.uk",
    "companieshouse.gov.uk",
    "company-information.service.gov.uk",
    "thegazette.co.uk",
    "licensed-sponsors-uk.com",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "google.com",
    "bing.com",
    "yell.com",
    "endole.co.uk",
    "checkcompany.co.uk",
    "companycheck.co.uk",
    "zoominfo.com",
    "dnb.com",
    "indeed.com",
    "reed.co.uk",
    "totaljobs.com",
  ];
  if (blocked.some((bad) => host === bad || host.endsWith(`.${bad}`))) return null;
  return `${parsed.protocol}//${host}`;
}

export function cleanEmails(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((value) => value.toLowerCase().trim())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        .filter((value) => !/\.(png|jpe?g|gif|svg|webp|ico|css|js)$/i.test(value)),
    ),
  );
}

export function cleanPhones(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((value) => value.replace(/[^\d+]/g, ""))
        .map((value) => (value.startsWith("+44") ? value : value.startsWith("0") ? `+44${value.slice(1)}` : ""))
        .filter((value) => {
          const digits = value.replace(/\D/g, "");
          return digits.length >= 11 && digits.length <= 13 && !/(\d)\1{6,}/.test(digits);
        }),
    ),
  );
}
