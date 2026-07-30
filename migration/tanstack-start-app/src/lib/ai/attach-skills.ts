import { matchSkills, renderSkillBlock, type SkillCandidate, type SkillMatch } from "./skill-matcher";

/** Load + match workspace skills for a user prompt (Lovable-style auto-attach). */
export async function attachSkillsToPrompt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  prompt: string,
  disabledSkillIds: string[] = [],
): Promise<{ block: string; matches: SkillMatch[] }> {
  try {
    const { data: skillRows } = await supabase
      .from("workspace_skills")
      .select("id, name, description, prompt, tags, use_count")
      .eq("user_id", userId)
      .limit(100);

    const disabledIds = new Set(disabledSkillIds);
    const candidates: SkillCandidate[] = (skillRows ?? [])
      .filter((r: { id: string }) => !disabledIds.has(r.id))
      .map((r: { id: string; name: string; description: string | null; prompt: string; tags: string[] | null }) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        prompt: r.prompt,
        tags: r.tags,
      }));

    const matches = matchSkills(prompt, candidates, { topN: 2 });
    if (matches.length === 0) return { block: "", matches: [] };

    for (const m of matches) {
      void supabase
        .from("workspace_skills")
        .update({
          use_count:
            ((skillRows ?? []).find((r: { id: string; use_count?: number }) => r.id === m.skill.id)?.use_count ?? 0) + 1,
        })
        .eq("id", m.skill.id)
        .then(() => null, () => null);
    }

    return { block: renderSkillBlock(matches), matches };
  } catch {
    return { block: "", matches: [] };
  }
}
