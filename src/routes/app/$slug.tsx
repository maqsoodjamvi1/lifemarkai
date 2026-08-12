import { createFileRoute,redirect,notFound } from "@tanstack/react-router";
import { resolveAppSlug } from "@/lib/public-server";

/**
 * /app/:slug — resolve published app slug → deploy/preview URL.
 * Visibility gates match Next app/app/[slug]/page.tsx.
 */
export const Route = createFileRoute("/app/$slug")({
  loader: async ({ params }) => {
    const result = await resolveAppSlug({ data: { slug: params.slug } });
    if (result.status === "not_found") throw notFound();
    if (result.status === "unauthenticated") {
      throw redirect({
        to: "/login",
        search: { next: `/app/${params.slug}` },
      });
    }
    // Absolute or relative destination (preview / deploy)
    throw redirect({ href: result.destination });
  },
  head: () => ({
    meta: [{ title: "Opening app… — LifemarkAI" }],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-bold">App not found</h1>
      <p className="text-sm text-muted-foreground">This published app slug does not exist.</p>
    </div>
  ),
  component: () => null,
});
