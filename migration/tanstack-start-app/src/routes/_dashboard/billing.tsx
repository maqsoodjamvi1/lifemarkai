import { createFileRoute,redirect } from "@tanstack/react-router";

/** Legacy `/billing` → canonical `/dashboard/billing`. */
export const Route = createFileRoute("/_dashboard/billing")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/billing" });
  },
  component: () => null,
});