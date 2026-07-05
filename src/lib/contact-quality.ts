export type ContactQuality = {
  score: number;
  label: "high" | "medium" | "low";
  reason: string;
};

export function scoreContact(input: {
  contactType: string;
  value: string;
  sourceUrl: string;
  websiteUrl?: string | null;
}): ContactQuality {
  const type = input.contactType.toLowerCase();
  const value = input.value.toLowerCase();
  const source = safeUrl(input.sourceUrl);
  const website = safeUrl(input.websiteUrl || "");
  const reasons: string[] = [];
  let score = 50;

  if (source?.pathname.includes("contact")) {
    score += 12;
    reasons.push("found on contact page");
  }

  if (type === "email") {
    const [local, domain] = value.split("@");
    if (domain && website && sameBusinessDomain(domain, website.hostname)) {
      score += 22;
      reasons.push("email domain matches website");
    }
    if (local && /^(info|contact|hello|admin|office|sales|support|enquiries|recruitment|careers|team)$/i.test(local)) {
      score += 18;
      reasons.push("business inbox");
    }
    if (domain && /^(gmail|outlook|hotmail|yahoo|icloud)\./i.test(domain)) {
      score -= 18;
      reasons.push("free mailbox domain");
    }
    if (local && /^[a-z]+[._-][a-z]+$/.test(local)) {
      score -= 8;
      reasons.push("looks like a personal inbox");
    }
  } else if (type === "phone") {
    if (/^\+44(1|2|3|8)/.test(input.value)) {
      score += 20;
      reasons.push("UK business-style number");
    } else if (/^\+447/.test(input.value)) {
      score += 4;
      reasons.push("UK mobile number");
    }
  }

  const finalScore = Math.max(10, Math.min(95, score));
  return {
    score: finalScore,
    label: finalScore >= 75 ? "high" : finalScore >= 50 ? "medium" : "low",
    reason: reasons.join("; ") || "basic public contact match",
  };
}

function safeUrl(value: string) {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
}

function sameBusinessDomain(emailDomain: string, websiteHost: string) {
  return rootDomain(emailDomain) === rootDomain(websiteHost.replace(/^www\./, ""));
}

function rootDomain(host: string) {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (["co.uk", "org.uk", "ac.uk", "gov.uk", "ltd.uk", "plc.uk"].includes(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}
