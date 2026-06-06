// @ts-nocheck
/**
 * Sentry server-side initialisation.
 * Called automatically by @sentry/nextjs for Node.js runtime.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Trace 20% of server transactions
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  enabled: process.env.NODE_ENV === "production",
  environment: process.env.NODE_ENV,

  beforeSend(event: Record<string, unknown>) {
    // Strip sensitive server-side data
    if (event.request?.headers) {
      delete event.request.headers["Authorization"];
      delete event.request.headers["Cookie"];
      delete event.request.headers["x-lifemark-api-key"];
    }
    // Never send Supabase service role key in breadcrumbs
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        const val = String(event.extra[key] ?? "");
        if (val.includes("service_role") || val.startsWith("lmk_")) {
          event.extra[key] = "[REDACTED]";
        }
      }
    }
    return event;
  },
});
