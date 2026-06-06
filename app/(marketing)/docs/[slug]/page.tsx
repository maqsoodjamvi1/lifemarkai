import { DocsSlugPage } from "@/components/marketing/docs-page";
import { DOC_PAGES } from "@/lib/docs/content";

export function generateStaticParams() {
  return DOC_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = DOC_PAGES.find((p) => p.slug === slug);
  return {
    title: page ? `${page.title} — LifemarkAI Docs` : "Docs — LifemarkAI",
    description: page?.description ?? "",
  };
}

export default async function DocSlugRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DocsSlugPage slug={slug} />;
}
