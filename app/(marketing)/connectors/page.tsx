import type { Metadata } from "next";
import { ConnectorsMarketplace } from "@/components/marketing/connectors-marketplace";

export const metadata: Metadata = {
  title: "Connectors — LifemarkAI",
  description: "Connect your apps to 20+ services including Slack, Stripe, Supabase, Notion, HubSpot, Shopify, and more.",
};

export default function ConnectorsPage() {
  return <ConnectorsMarketplace />;
}
