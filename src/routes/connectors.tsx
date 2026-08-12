// Converted from app/(marketing)/connectors/page.tsx.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/connectors")({
  head: () => ({
    meta: [
      { title: "Connectors — LifemarkAI" },
      { name: "description", content: "Connect your apps to 20+ services including Slack, Stripe, Supabase, Notion, HubSpot, Shopify, and more." },
    ],
  }),
  component: ConnectorsPage,
});

function ConnectorsPage() {
  // Full migration: import { ConnectorsMarketplace } from "@/components/marketing/connectors-marketplace"
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-3xl px-6 pt-24 text-center space-y-3">
        <h1 className="text-4xl font-bold">Connectors</h1>
        <p className="text-neutral-400">Mount &lt;ConnectorsMarketplace/&gt; here once migrated.</p>
      </main>
    </div>
  );
}
