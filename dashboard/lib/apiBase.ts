function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}

function ensureLeadingSlash(s: string) {
  return s.startsWith("/") ? s : `/${s}`;
}

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim();

export function apiUrl(path: string) {
  const p = ensureLeadingSlash(path);

  if (!API_BASE) return p;

  if (API_BASE.startsWith("/")) {
    return `${stripTrailingSlash(API_BASE)}${p}`;
  }

  return `${stripTrailingSlash(API_BASE)}${p}`;
}