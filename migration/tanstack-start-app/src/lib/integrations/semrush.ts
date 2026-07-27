/**
 * Semrush API client — keyword & domain research for the SEO panel.
 * Docs: https://developer.semrush.com/api/
 */

export type SemrushDatabase =
  | "us"
  | "uk"
  | "ca"
  | "au"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "br"
  | "in";

export interface KeywordMetrics {
  keyword: string;
  searchVolume: number;
  cpc: number;
  competition: number;
  results: number;
}

export interface RelatedKeyword {
  keyword: string;
  searchVolume: number;
  cpc: number;
  competition: number;
}

export interface DomainOverview {
  domain: string;
  rank: number;
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
}

const BASE = "https://api.semrush.com/";

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(";"));
}

async function semrushRequest(params: Record<string, string>): Promise<string> {
  const key = process.env.SEMRUSH_API_KEY;
  if (!key) throw new SemrushNotConfiguredError();

  const url = new URL(BASE);
  for (const [k, v] of Object.entries({ ...params, key })) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), { next: { revalidate: 86_400 } });
  const body = await res.text();

  if (!res.ok || body.startsWith("ERROR")) {
    throw new Error(body.replace(/^ERROR \d+ :: /, "").trim() || `Semrush API error (${res.status})`);
  }
  return body;
}

export class SemrushNotConfiguredError extends Error {
  constructor() {
    super("SEMRUSH_API_KEY is not configured");
    this.name = "SemrushNotConfiguredError";
  }
}

export function isSemrushConfigured(): boolean {
  return !!process.env.SEMRUSH_API_KEY?.trim();
}

/** Keyword overview — volume, CPC, competition. */
export async function getKeywordMetrics(
  phrase: string,
  database: SemrushDatabase = "us"
): Promise<KeywordMetrics> {
  const raw = await semrushRequest({
    type: "phrase_this",
    phrase: phrase.trim(),
    database,
    export_columns: "Ph,Nq,Cp,Co,Nr",
  });

  const rows = parseCsv(raw);
  const data = rows[1];
  if (!data) throw new Error("No keyword data returned");

  return {
    keyword: data[0] ?? phrase,
    searchVolume: Number(data[1]) || 0,
    cpc: Number(data[2]) || 0,
    competition: Number(data[3]) || 0,
    results: Number(data[4]) || 0,
  };
}

/** Top related keywords for a seed term. */
export async function getRelatedKeywords(
  phrase: string,
  database: SemrushDatabase = "us",
  limit = 10
): Promise<RelatedKeyword[]> {
  const raw = await semrushRequest({
    type: "phrase_related",
    phrase: phrase.trim(),
    database,
    export_columns: "Ph,Nq,Cp,Co",
    display_limit: String(limit),
  });

  const rows = parseCsv(raw);
  return rows.slice(1).map((r) => ({
    keyword: r[0] ?? "",
    searchVolume: Number(r[1]) || 0,
    cpc: Number(r[2]) || 0,
    competition: Number(r[3]) || 0,
  }));
}

/** Domain organic overview. */
export async function getDomainOverview(
  domain: string,
  database: SemrushDatabase = "us"
): Promise<DomainOverview> {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const raw = await semrushRequest({
    type: "domain_ranks",
    domain: clean,
    database,
    export_columns: "Dn,Rk,Or,Ot,Oc",
  });

  const rows = parseCsv(raw);
  const data = rows[1];
  if (!data) throw new Error("No domain data returned");

  return {
    domain: data[0] ?? clean,
    rank: Number(data[1]) || 0,
    organicKeywords: Number(data[2]) || 0,
    organicTraffic: Number(data[3]) || 0,
    organicCost: Number(data[4]) || 0,
  };
}

/** Format research for AI chat context. */
export function formatSemrushContext(data: {
  keyword?: KeywordMetrics;
  related?: RelatedKeyword[];
  domain?: DomainOverview;
}): string {
  const lines: string[] = ["## Semrush SEO Research"];

  if (data.keyword) {
    lines.push(
      `Keyword "${data.keyword.keyword}": ${data.keyword.searchVolume.toLocaleString()} monthly searches, CPC $${data.keyword.cpc.toFixed(2)}, competition ${(data.keyword.competition * 100).toFixed(0)}%`
    );
  }

  if (data.related?.length) {
    lines.push("Related keywords:");
    for (const r of data.related.slice(0, 8)) {
      lines.push(`- ${r.keyword}: ${r.searchVolume.toLocaleString()} vol, CPC $${r.cpc.toFixed(2)}`);
    }
  }

  if (data.domain) {
    lines.push(
      `Domain ${data.domain.domain}: rank ${data.domain.rank}, ${data.domain.organicKeywords.toLocaleString()} organic keywords, ~${data.domain.organicTraffic.toLocaleString()} organic traffic/mo`
    );
  }

  return lines.join("\n");
}
