// @ts-nocheck
/**
 * Sentry client-side initialisation.
 * Called automatically by @sentry/nextjs for browser sessions.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of sessions as replays in production; 100% on errors
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Trace 20% of transactions for performance monitoring
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Only enable in production — keep local dev console clean
  enabled: process.env.NODE_ENV === "production",

  environment: process.env.NODE_ENV,

  // Filter out noise
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error exception captured",
    "NetworkError when attempting to fetch resource",
    /^AbortError/,
    /^ChunkLoadError/,
  ],

  beforeSend(event: Record<string, unknown>) {
    // Strip auth tokens from breadcrumbs / request headers before sending
    if (event.request?.headers) {
      delete event.request.headers["Authorization"];
      delete event.request.headers["Cookie"];
      delete event.request.headers["x-lifemark-api-key"];
    }
    return event;
  },

  integrations: [
    Sentry.replayIntegration({
      // Mask all inputs (PII protection)
      maskAllInputs: true,
      blockAllMedia: false,
    }),
  ],
});
