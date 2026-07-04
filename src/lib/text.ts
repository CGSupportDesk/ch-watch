import crypto from "node:crypto";

export function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function norm(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

export function sha1(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

export function sponsorKey(name: string, town?: string | null, county?: string | null) {
  return sha1(`${norm(name)}|${norm(town)}|${norm(county)}`);
}

export function searchName(name: string) {
  return clean(name).replace(/\s+(T\/A|TRADING AS)\s+.+$/i, "").replace(/\s+-\s+.+$/, "");
}

export function similarity(a: string, b: string) {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.includes(right) || right.includes(left)) return 88;
  const max = Math.max(left.length, right.length);
  const distance = levenshtein(left, right);
  return Math.max(0, Math.round((1 - distance / max) * 100));
}

export function formatAddress(addr: Record<string, unknown> | null | undefined) {
  if (!addr) return "";
  return [
    addr.care_of,
    addr.premises,
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ]
    .map(clean)
    .filter(Boolean)
    .join(", ");
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[a.length][b.length];
}
