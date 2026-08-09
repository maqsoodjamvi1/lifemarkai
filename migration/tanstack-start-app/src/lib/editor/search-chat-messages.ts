import type { Message } from "../../types/database.ts";

export type ChatSearchMode = "keyword" | "semantic";

export interface ChatSearchHit {
  id: string;
  score: number;
  snippet: string;
  role: Message["role"];
  createdAt: string;
}

export interface SearchableMessage {
  id: string;
  content: string;
  role: string;
  created_at: string;
}

function normalizeRole(role: string): Message["role"] {
  return role === "user" || role === "assistant" || role === "system" ? role : "assistant";
}

const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "is", "it",
  "this", "that", "with", "from", "as", "be", "by", "was", "are", "were", "been", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might",
  "can", "i", "you", "we", "they", "he", "she", "my", "your", "our", "their",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function snippetAround(content: string, terms: string[], max = 140): string {
  const lower = content.toLowerCase();
  let idx = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return content.replace(/\s+/g, " ").slice(0, max);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + max);
  const chunk = content.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + chunk + (end < content.length ? "…" : "");
}

/** Fast keyword rank for chat history (no embeddings). */
export function rankMessagesByKeyword(
  messages: SearchableMessage[],
  query: string,
  limit = 50,
): ChatSearchHit[] {
  const terms = tokenize(query);
  if (!terms.length) return [];

  const hits: ChatSearchHit[] = [];
  for (const msg of messages) {
    const content = msg.content ?? "";
    const lower = content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += term.length >= 4 ? 3 : 2;
    }
    if (terms.length > 1 && lower.includes(query.toLowerCase().trim())) score += 5;
    if (score <= 0) continue;
    hits.push({
      id: msg.id,
      score,
      snippet: snippetAround(content, terms),
      role: normalizeRole(msg.role),
      createdAt: msg.created_at,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Rank by embedding cosine similarity (query vector precomputed). */
export function rankMessagesByEmbedding(
  messages: SearchableMessage[],
  queryVector: number[],
  vectors: Map<string, number[]>,
  limit = 50,
): ChatSearchHit[] {
  const hits: ChatSearchHit[] = [];
  for (const msg of messages) {
    const vec = vectors.get(msg.id);
    if (!vec) continue;
    const score = cosineSimilarity(queryVector, vec);
    if (score < 0.25) continue;
    hits.push({
      id: msg.id,
      score,
      snippet: (msg.content ?? "").replace(/\s+/g, " ").slice(0, 160),
      role: normalizeRole(msg.role),
      createdAt: msg.created_at,
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
