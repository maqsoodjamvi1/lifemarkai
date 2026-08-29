/**
 * Pure detection logic behind src/routes/api/projects/$id/remix.ts's
 * "Disconnect Supabase" default — pulled out so the heuristic (previously
 * only exercised by a live remix) is unit tested. Getting this wrong in
 * either direction is a real cost: a false negative ships someone else's
 * Supabase keys into a stranger's remix silently connected to the
 * original owner's database; a false positive strips a project's own
 * (already-fine) Supabase code for no reason.
 */

export interface DetectedSupabaseWiring {
  hasSupabase: boolean;
  evidence: string[];
}

const MAX_EVIDENCE = 6;

export function hasSupabaseWired(
  files: Array<{ path: string; content: string }>,
): DetectedSupabaseWiring {
  const evidence: string[] = [];
  for (const f of files) {
    const lower = f.path.toLowerCase();
    if (/supabase\/(migrations|functions)\//.test(lower)) { evidence.push(f.path); continue; }
    const c = f.content ?? "";
    if (/@supabase\/(supabase-js|ssr|auth-helpers)/.test(c)) {
      evidence.push(`${f.path} (import)`);
    } else if (/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(c)) {
      evidence.push(`${f.path} (env)`);
    } else if (/createClient\s*\(.*supabase/i.test(c)) {
      evidence.push(`${f.path} (client)`);
    }
    if (evidence.length >= MAX_EVIDENCE) break;
  }
  const uniq = [...new Set(evidence)];
  return { hasSupabase: uniq.length > 0, evidence: uniq };
}
