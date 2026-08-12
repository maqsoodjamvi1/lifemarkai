import { createFileRoute,Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_dashboard/dashboard/settings/security")({
  head: () => ({ meta: [{ title: "Security settings — LifemarkAI" }] }),
  component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
  return (
    <div className="flex-1 overflow-auto p-6 md:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Security settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        MFA, sessions, and sign-in devices. Use Security Center for the full controls.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/dashboard/security">
          <Button>Open Security Center</Button>
        </Link>
        <Link to="/dashboard/settings">
          <Button variant="outline">Account settings</Button>
        </Link>
      </div>
    </div>
  );
}
