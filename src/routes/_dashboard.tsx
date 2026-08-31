/**
 * /_dashboard — pathless layout route.
 *
 * Port of app/(dashboard)/layout.tsx. The Next route group `(dashboard)`
 * becomes a TanStack pathless layout (`_dashboard`): it wraps every child
 * route (`/dashboard`, `/dashboard/analytics`, …) without adding a URL
 * segment, and runs the shared auth guard + sidebar data load once.
 *
 * Auth: the loader calls the `fetchDashboardShell` server function (runs
 * server-side, reads the Supabase session cookie) and throws
 * `redirect({ to: "/login" })` when there is no user — the TanStack Start
 * equivalent of the old `if (!user) redirect("/login")`.
 */
import { createFileRoute,redirect,Outlet } from "@tanstack/react-router";
import { fetchDashboardShell } from "@/lib/dashboard-server";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { PwaInstallPrompt } from "@/components/dashboard/pwa-install-prompt";

export const Route = createFileRoute("/_dashboard")({
  loader: async ({ location }) => {
    const shell = await fetchDashboardShell();
    if (!shell.user) {
      const returnTo = `${location.pathname}${location.searchStr || ""}${location.hash || ""}`;
      throw redirect({ to: "/login", search: { next: returnTo } });
    }
    return shell;
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, profile, recentProjects } = Route.useLoaderData();

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        user={user!}
        profile={profile}
        recentProjects={recentProjects}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
      <PwaInstallPrompt />
    </div>
  );
}
