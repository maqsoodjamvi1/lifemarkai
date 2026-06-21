/**
 * Template-refinement prompt block.
 *
 * Adapts the "Hostinger Horizons" insight: anchor generation to a professionally
 * designed baseline so output looks designed, not generated. When a build request
 * carries a templateId, we append this block to the system prompt — instructing
 * the model to REFINE the chosen template's design system rather than invent a
 * layout from scratch. The model still fills in the user's actual content/feature.
 *
 * See lib/templates/starter-catalog.ts.
 */
import { getStarterTemplate } from "@/lib/templates/starter-catalog";

/**
 * Build a system-prompt block for a chosen starter template. Returns "" when the
 * id is unknown, so callers can append unconditionally.
 */
export function buildTemplateRefinementBlock(templateId?: string | null): string {
  if (!templateId) return "";
  const t = getStarterTemplate(templateId);
  if (!t) return "";

  const c = t.tokens.colors;
  return `

---
# DESIGN BASELINE — refine this template (do NOT design from scratch)
You are starting from the "${t.name}" template (${t.category}). Treat its design
system as the source of truth and adapt the user's content/features INTO it.
Keep the look cohesive and polished; do not invent a different visual language.

## Design tokens (use consistently)
- Background ${c.background} · Surface ${c.surface} · Border ${c.border}
- Text ${c.text} · Muted text ${c.textMuted}
- Primary ${c.primary} (on ${c.primaryFg}) · Accent ${c.accent}
- Fonts — headings: ${t.tokens.fonts.heading}; body: ${t.tokens.fonts.body}
- Radius: ${t.tokens.radius} · Shadow: ${t.tokens.shadow}
- Visual vibe: ${t.tokens.vibe.join(", ")}

## Section blueprint (include these, in order, adapting to the user's domain)
${t.sections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Design directions (follow precisely — this is what makes it look designed)
${t.designNotes.map((n) => `- ${n}`).join("\n")}

## Rules
- Apply the tokens as Tailwind classes / CSS variables; keep one consistent palette.
- Replace placeholder copy with content relevant to the user's request.
- Keep spacing generous and the type hierarchy strong (clear h1 → h2 → body scale).
- Reuse the same component patterns across sections for consistency.
---`;
}
