/**
 * Contextual follow-up suggestion chips (Lovable parity — observed in their
 * live editor DOM: "Add blog search", "Enable category filters", "Set up SEO
 * metadata", "Add admin post editor", "Add blog pagination" rendered above
 * the composer after builds).
 *
 * Deliberately STATIC (zero AI cost, zero latency): suggestions derive from
 * the detected app type + what the project already contains. Rotating pools
 * keep chips fresh across builds without a model call.
 */
import { classifyBuildIntent, type BuildAppType } from "./build-intent.ts";

const GENERIC_POOL = [
  "Add a dark mode toggle",
  "Improve mobile responsiveness",
  "Add loading skeletons",
  "Set up SEO metadata",
  "Add a 404 page",
  "Polish hover and focus states",
];

const POOL_BY_TYPE: Partial<Record<BuildAppType, string[]>> = {
  "marketing-website": [
    "Add a contact form",
    "Add a testimonials section",
    "Add an FAQ section",
    "Add a blog page",
    "Add a newsletter signup",
    "Add smooth scroll animations",
  ],
  ecommerce: [
    "Add product search",
    "Enable category filters",
    "Add a wishlist",
    "Add product reviews",
    "Add related products",
    "Add order tracking",
  ],
  saas: [
    "Add user onboarding flow",
    "Add a pricing page",
    "Add usage analytics charts",
    "Add team invitations",
    "Add notification preferences",
  ],
  "admin-dashboard": [
    "Add CSV export",
    "Add date-range filters",
    "Add bulk actions",
    "Add audit log view",
    "Add role-based access",
  ],
  booking: [
    "Add calendar availability view",
    "Add booking confirmations",
    "Add cancellation flow",
    "Add reminder notifications",
  ],
  social: [
    "Add user profiles",
    "Add comments and replies",
    "Add notifications feed",
    "Add follow suggestions",
  ],
  education: [
    "Add progress tracking",
    "Add quizzes",
    "Add certificates",
    "Add course search",
  ],
  marketplace: [
    "Add seller profiles",
    "Add listing search filters",
    "Add messaging between users",
    "Add ratings and reviews",
  ],
};

/** Deterministic-but-rotating pick: seed by file count so chips change as the
 *  project grows, without storing state. */
function pick(pool: string[], count: number, seed: number): string[] {
  if (pool.length <= count) return [...pool];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(pool[(seed + i * 2) % pool.length]);
  return [...new Set(out)];
}

/** Drop suggestions the project plausibly already has (path keyword match). */
function filterExisting(suggestions: string[], filePaths: string[]): string[] {
  const joined = filePaths.join(" ").toLowerCase();
  const KEYWORDS: Array<[RegExp, RegExp]> = [
    [/blog/i, /blog/],
    [/contact form/i, /contact/],
    [/pricing/i, /pricing/],
    [/wishlist/i, /wishlist/],
    [/review/i, /review/],
    [/faq/i, /faq/],
    [/404/i, /notfound|not-found|404/],
    [/profile/i, /profile/],
    [/quiz/i, /quiz/],
  ];
  return suggestions.filter((s) => {
    const hit = KEYWORDS.find(([sug]) => sug.test(s));
    return !hit || !hit[1].test(joined);
  });
}

export function suggestFollowUps(
  lastPrompt: string,
  filePaths: string[],
  max = 5,
): string[] {
  let appType: BuildAppType = "general-app";
  try {
    appType = classifyBuildIntent(lastPrompt || "app").appType;
  } catch {
    /* classifier must never break chips */
  }
  const typed = POOL_BY_TYPE[appType] ?? [];
  const seed = filePaths.length;
  const combined = [
    ...pick(typed, Math.min(4, typed.length), seed),
    ...pick(GENERIC_POOL, 3, seed),
  ];
  return filterExisting([...new Set(combined)], filePaths).slice(0, max);
}
