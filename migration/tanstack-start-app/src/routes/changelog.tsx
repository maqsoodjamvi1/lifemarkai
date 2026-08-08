import { createFileRoute,Link } from "@tanstack/react-router";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "Changelog — LifemarkAI" },
      { name: "description", content: "New features, improvements and fixes in LifemarkAI." },
    ],
  }),
  component: ChangelogPage,
});

const RELEASES = [
  {
    version: "2.8.0",
    date: "May 2026",
    title: "Playwright test runner + Resend domain verification",
    items: [
      "In-browser Playwright / Vitest test runner with live SSE log streaming",
      "Resend domain verification with exact DNS records + one-click re-check",
    ],
  },
  {
    version: "2.7.0",
    date: "May 2026",
    title: "Gift cards, student discounts, and profile privacy",
    items: [
      "Discounts tab in billing: gift card / promo redemption wired to Stripe",
      "50% student discount for 3 months with .edu verification",
    ],
  },
];

function ChangelogPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-4xl font-bold">Changelog</h1>
        <Link to="/" className="mt-2 inline-block text-sm text-violet-400 hover:underline">
          ← Back home
        </Link>
        <div className="mt-10 space-y-10">
          {RELEASES.map((r) => (
            <section key={r.version}>
              <div className="flex items-baseline gap-3">
                <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs tabular-nums">{r.version}</span>
                <span className="text-xs text-neutral-500">{r.date}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold">{r.title}</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-neutral-400">
                {r.items.map((it, i) => (
                  <li key={i}>• {it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
