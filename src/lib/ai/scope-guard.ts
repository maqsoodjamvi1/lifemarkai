/**
 * A pre-flight check that can stop a build BEFORE it starts and ask a question
 * instead.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Observed in Lovable's editor: a user pasted a specification for a 30-subsystem
 * AI engineering platform into a project that was already a working site
 * builder. Lovable did not attempt it. It answered with three grounds — it
 * would destroy the existing app, it is impossible on this runtime, and it is
 * months of work rather than one prompt — and then asked, "Before I touch
 * anything, can you confirm what you actually want?"
 *
 * We had no equivalent. `guard-file-write.ts` refuses individual bad WRITES
 * (blanking a file, unparseable JSON); nothing anywhere evaluated a REQUEST.
 * Every prompt reaching the router was classified and executed. Given that same
 * paste, we would have started rewriting the user's working app — and the most
 * valuable thing to do in that moment was nothing at all.
 *
 * ── Why it asks instead of refusing ─────────────────────────────────────────
 *
 * This never blocks permanently. It returns concerns and a question; the client
 * shows them with a "build it anyway" affordance that re-sends with
 * `forceBuild: true`, which skips this check entirely.
 *
 * That property is what makes the whole thing safe to ship. A false positive
 * costs one extra click. A false negative costs someone their working app. So
 * the detectors below are tuned to catch the expensive mistake, accepting that
 * they will occasionally ask a question that did not need asking. If you are
 * ever tempted to make this hard-fail instead of ask, don't — the asymmetry
 * that justifies the sensitivity disappears the moment it stops being
 * overridable.
 */

export type ScopeConcernKind = "runtime" | "sprawl" | "destructive";

export interface ScopeConcern {
  kind: ScopeConcernKind;
  /** One sentence naming what was asked for. */
  what: string;
  /** One sentence on why it can't be done, or shouldn't be done blind. */
  why: string;
}

export interface ScopeAssessment {
  concerns: ScopeConcern[];
  /** The single question to put to the user. */
  question: string;
}

export interface ScopeGuardContext {
  /** Files the USER has (see scaffold-files.ts) — NOT files.length. */
  userAuthoredFileCount: number;
}

/**
 * Capabilities a browser-previewed React + Vite sandbox genuinely cannot have.
 *
 * Every entry here must be something that is impossible, not merely hard. "Hard"
 * is the user's call to make, not ours. Each pattern is anchored on the
 * TECHNOLOGY, never on the domain — "a dashboard for our Kubernetes clusters" is
 * an ordinary React app and must not match, while "orchestrate Kubernetes pods"
 * must.
 */
const RUNTIME_LIMITS: Array<{ regex: RegExp; what: string; why: string }> = [
  {
    regex: /\b(firecracker|micro-?vm|\bkvm\b|qemu|hypervisor|bare[- ]metal provisioning)\b/i,
    what: "running virtual machines",
    why: "previews run as a Node process in a container — there is no hypervisor underneath it",
  },
  {
    regex: /\b(orchestrat\w+ (?:kubernetes|k8s|containers?|pods?)|spin up (?:containers?|pods?|vms?)|docker[- ]in[- ]docker|schedule (?:containers?|pods?))\b/i,
    what: "orchestrating containers",
    why: "the generated app runs inside a sandbox and cannot start sibling containers",
  },
  {
    regex: /\b(terraform|cloudformation|pulumi|ansible|provision (?:aws|azure|gcp|cloud) infrastructure|deploy to (?:aws|azure|gcp) from)\b/i,
    what: "provisioning cloud infrastructure",
    why: "that needs long-lived cloud credentials and a CI runner, neither of which a generated app has",
  },
  {
    regex: /\b(fine[- ]?tun\w+ (?:a |an |the )?(?:model|llm)|train (?:a |an |our )?(?:model|llm|neural net)|model training pipeline)\b/i,
    what: "training or fine-tuning models",
    why: "there is no GPU and no training runtime in the preview environment",
  },
  {
    regex: /\b(native (?:ios|android) app|swift ?ui|xcode|kotlin|jetpack compose|\.ipa\b|\.apk\b|app ?store submission|play ?store submission)\b/i,
    what: "a native mobile app",
    why: "we generate web apps — a native binary needs a platform toolchain we don't run",
  },
  {
    regex: /\b(electron app|desktop app installer|\.dmg\b|\.exe installer|tauri app|native desktop binary)\b/i,
    what: "a packaged desktop application",
    why: "the output is a web app served over HTTP, not a compiled desktop binary",
  },
  {
    regex: /\b(execute (?:arbitrary|untrusted) code|sandboxed code execution engine|run user[- ]submitted code server[- ]side|remote code execution service)\b/i,
    what: "executing untrusted code server-side",
    why: "that is the thing our own sandbox exists to contain; a generated app cannot host one",
  },
  {
    regex: /\b(unreal engine|unity3d|unity engine|godot export|native game engine)\b/i,
    what: "a native game engine",
    why: "those compile to platform binaries; the browser runtime can't host them",
  },
  {
    regex: /\b(run (?:a )?(?:blockchain|ethereum|bitcoin) node|mining (?:rig|pool|node)|validator node)\b/i,
    what: "running a blockchain node",
    why: "a node needs persistent networking and storage the preview doesn't provide",
  },
  {
    regex: /\b(video transcoding (?:server|pipeline|service)|ffmpeg server|live (?:video )?stream(?:ing)? server|rtmp (?:server|ingest))\b/i,
    what: "server-side video transcoding",
    why: "that needs native binaries and sustained CPU a preview container doesn't have",
  },
];

/**
 * Distinct product domains. Naming several at once in ONE request is the
 * clearest signal that a prompt is a roadmap rather than a task.
 *
 * Kept deliberately coarse — these are whole products, not features. "Add a
 * checkout to my store" names one domain. "A store, a CRM, an LMS and a
 * helpdesk" names four, and no single build produces four working products.
 */
const DOMAIN_MARKERS: Array<{ id: string; regex: RegExp }> = [
  { id: "ecommerce", regex: /\b(e-?commerce|online store|storefront|shopping cart)\b/i },
  { id: "crm", regex: /\b(crm|sales pipeline|lead management)\b/i },
  { id: "erp", regex: /\b(erp|inventory management|supply chain|procurement)\b/i },
  { id: "lms", regex: /\b(lms|learning platform|course platform|e-?learning)\b/i },
  { id: "helpdesk", regex: /\b(helpdesk|help desk|support ticket|service desk)\b/i },
  { id: "hr", regex: /\b(hrms|hris|payroll|applicant tracking|recruitment system)\b/i },
  { id: "accounting", regex: /\b(accounting system|bookkeeping|general ledger|invoicing system)\b/i },
  { id: "social", regex: /\b(social network|community platform|discussion forum)\b/i },
  { id: "marketplace", regex: /\b(marketplace|multi-?vendor|classifieds)\b/i },
  { id: "booking", regex: /\b(booking system|appointment system|reservation system)\b/i },
  { id: "healthcare", regex: /\b(emr|ehr|patient records?|clinic management)\b/i },
  { id: "logistics", regex: /\b(fleet management|shipment tracking|dispatch system)\b/i },
  { id: "cms", regex: /\b(\bcms\b|content management system|publishing platform)\b/i },
  { id: "analytics", regex: /\b(analytics platform|bi platform|data warehouse)\b/i },
  { id: "devtools", regex: /\b(ci\/cd|code editor|ide\b|app builder|deployment platform)\b/i },
  { id: "payments", regex: /\b(payment gateway|billing platform|subscription platform)\b/i },
];

/** "30+ subsystems", "15 modules", "twelve features" — an explicit inventory. */
const ENUMERATED_SCOPE =
  /\b(\d{2,})\s*\+?\s*(?:major\s+|massive\s+|core\s+|distinct\s+|separate\s+)?(subsystems?|systems?|modules?|services?|micro-?services?|platforms?|products?|apps?|applications?)\b/i;

/** Asking to throw away what exists. */
const DESTRUCTIVE_REWRITE =
  /\b(start (?:over|from scratch|again)|rebuild (?:it |this |the app |everything )?from scratch|scrap (?:it|this|everything|the app)|delete everything|wipe (?:it|everything|the (?:app|project|database))|replace the (?:whole|entire) (?:app|thing|project)|throw (?:it |this )?away and)\b/i;

/** How many whole products a single request may name before we ask. */
const DOMAIN_SPRAWL_THRESHOLD = 4;
/**
 * Domain COUNTING is inference — four product nouns in a sentence might be a
 * comparison, a list of competitors, or someone describing their industry. It
 * needs the corroborating signal of a prompt long enough to actually be a
 * roadmap. Explicit enumeration ("30+ subsystems") needs no such corroboration
 * and is deliberately NOT subject to this floor: someone who wrote the number
 * down has told us the scope directly, at whatever length.
 */
const SPRAWL_MIN_PROMPT_CHARS = 300;

function detectRuntimeLimits(prompt: string): ScopeConcern[] {
  const out: ScopeConcern[] = [];
  for (const { regex, what, why } of RUNTIME_LIMITS) {
    if (regex.test(prompt)) out.push({ kind: "runtime", what, why });
    // Two named impossibilities are plenty to make the point.
    if (out.length === 2) break;
  }
  return out;
}

function detectSprawl(prompt: string): ScopeConcern | null {
  // Checked first and WITHOUT a length floor. The case that motivated this
  // whole module — "a spec with 30+ massive subsystems" — was 307 characters,
  // so a 400-character floor would have missed the one prompt it was written
  // for. An explicit count is not a guess; it does not need corroborating.
  const enumerated = prompt.match(ENUMERATED_SCOPE);
  if (enumerated) {
    const count = Number(enumerated[1]);
    if (Number.isFinite(count) && count >= 10) {
      return {
        kind: "sprawl",
        what: `${enumerated[1]} ${enumerated[2].toLowerCase()} in one request`,
        why: "each of those is its own build — done in one pass they'd all come out as stubs",
      };
    }
  }

  // Counting product nouns IS a guess, so it keeps the floor.
  if (prompt.length < SPRAWL_MIN_PROMPT_CHARS) return null;

  const domains = DOMAIN_MARKERS.filter((d) => d.regex.test(prompt)).map((d) => d.id);
  if (domains.length >= DOMAIN_SPRAWL_THRESHOLD) {
    return {
      kind: "sprawl",
      what: `${domains.length} separate products in one request`,
      why: "building them together means none of them gets built properly",
    };
  }
  return null;
}

function detectDestructive(prompt: string, ctx: ScopeGuardContext): ScopeConcern | null {
  // Nothing to destroy on a project that has no work in it yet.
  if (ctx.userAuthoredFileCount === 0) return null;
  if (!DESTRUCTIVE_REWRITE.test(prompt)) return null;
  return {
    kind: "destructive",
    what: "replacing the app that's already here",
    why: `this project already has ${ctx.userAuthoredFileCount} file${ctx.userAuthoredFileCount === 1 ? "" : "s"} of your work, and a rebuild doesn't keep them`,
  };
}

function buildQuestion(concerns: ScopeConcern[], ctx: ScopeGuardContext): string {
  const kinds = new Set(concerns.map((c) => c.kind));
  if (kinds.has("destructive")) {
    return "Do you want me to replace what's there, or add to it? I'll keep the current app unless you tell me otherwise.";
  }
  if (kinds.has("runtime") && kinds.has("sprawl")) {
    return "Which one part should I build first, using what this runtime can actually do?";
  }
  if (kinds.has("runtime")) {
    return "Do you want me to build the parts that do work here, and leave the rest out?";
  }
  return ctx.userAuthoredFileCount === 0
    ? "Which one of these should I build first? I'll do that one properly, then we add the rest."
    : "Which one should I start with? I'll build it into what's already here rather than over the top of it.";
}

/**
 * Should we ask before building?
 *
 * Returns `null` for the overwhelming majority of requests — say nothing, build
 * the thing. Returns an assessment only when a request names something the
 * runtime cannot do, spans several whole products at once, or would discard
 * work that already exists.
 */
export function assessRequestScope(
  prompt: string,
  ctx: ScopeGuardContext,
): ScopeAssessment | null {
  const text = (prompt ?? "").trim();
  if (!text) return null;

  const concerns: ScopeConcern[] = [
    ...detectRuntimeLimits(text),
    detectSprawl(text),
    detectDestructive(text, ctx),
  ].filter((c): c is ScopeConcern => c !== null);

  if (concerns.length === 0) return null;
  return { concerns, question: buildQuestion(concerns, ctx) };
}

/**
 * Render an assessment as the assistant message the user reads.
 *
 * Prose, not a bulleted refusal — the point is to sound like someone who
 * understood the request and has a reservation, not like a validation error.
 */
export function formatScopeAssessment(assessment: ScopeAssessment): string {
  const lines: string[] = [];
  lines.push("Before I touch anything — a few things about this request give me pause:");
  lines.push("");
  for (const c of assessment.concerns) {
    lines.push(`- **${c.what}** — ${c.why}.`);
  }
  lines.push("");
  lines.push(assessment.question);
  lines.push("");
  lines.push(
    "_If you'd rather I just attempt it as written, say so and I'll go ahead._",
  );
  return lines.join("\n");
}
