import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/dashboard/settings/branding")({
  head: () => ({ meta: [{ title: "Branding — LifemarkAI" }] }),
  component: BrandingSettingsPage,
});

function BrandingSettingsPage() {
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Workspace branding</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Logo, colors, and custom domain chrome. Full branding editor panels are still being
        ported into this Start shell.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/dashboard/settings">
          <Button variant="outline">Back to settings</Button>
        </Link>
      </div>
    </div>
  );
}
