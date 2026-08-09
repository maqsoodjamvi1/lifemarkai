import type { ReactNode } from "react";
import {
Outlet,
createRootRoute,
HeadContent,
Scripts,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import appCss from "../styles.css?url";
import { PreviewBooting } from "@/components/preview-booting";
import {
isSandboxPreviewHost,
previewHostOptionsFromEnv,
} from "@/lib/preview/preview-host";

/**
 * Is this request for a preview hostname with no sandbox behind it?
 *
 * A server fn rather than a direct import: the host helpers only exist on the
 * server, and this keeps them out of the client bundle. During SSR it runs
 * in-process, so it costs a function call, not a round trip.
 */
const detectPreviewBootHost = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { getRequestHost, setResponseStatus } = await import(
        "@tanstack/react-start/server"
      );
      const host = getRequestHost({ xForwardedHost: true });
      if (!isSandboxPreviewHost(host, previewHostOptionsFromEnv())) return false;
      // 503 + implicit "come back later" keeps a shared preview link honest to
      // anything that isn't a person: this is a temporary absence, not the page
      // the URL will eventually serve.
      try {
        setResponseStatus(503);
      } catch {
        /* the status is a nicety; the page is the point */
      }
      return true;
    } catch {
      // A hostname check must never be able to break the app.
      return false;
    }
  },
);

export const Route = createRootRoute({
  /**
   * Claim requests for preview hostnames that currently have no sandbox.
   *
   * `*.preview.lifemarkai.com` is wildcard DNS, so while a project's container
   * is down the request falls through to this app — which then renders the
   * LifemarkAI marketing homepage inside the user's preview pane, or shows a
   * signup page to whoever they shared a preview link with. Both read as "your
   * app is gone" rather than "your app is starting".
   *
   * The editor no longer frames a preview URL until a probe confirms it, so the
   * normal flow never lands here. This is for the paths that bypass the
   * editor's state machine: a shared link, a manual reload mid-boot, a bookmark
   * to a project whose sandbox has since been reclaimed.
   */
  beforeLoad: async () => {
    // Server-only: the browser has no env to read, and by the time the client
    // hydrates the server has already decided. Calling it here would turn a
    // free in-process call into an HTTP request on every navigation.
    if (typeof window !== "undefined") return { previewBooting: false };
    try {
      return { previewBooting: await detectPreviewBootHost() };
    } catch {
      return { previewBooting: false };
    }
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LifemarkAI App" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const ctx = Route.useRouteContext() as { previewBooting?: boolean };
  return (
    <RootDocument>
      {ctx?.previewBooting ? <PreviewBooting /> : <Outlet />}
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <RuntimeEnvScript />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_APP_URL",
] as const;

/**
 * Keep runtime public configuration inside React's document tree.
 *
 * The production host used to splice this script into the completed HTML
 * response. That made the server DOM differ from the client tree and caused
 * React to abandon hydration on every production page. During hydration the
 * script has already populated `globalThis.__LM_ENV__`, so both sides render
 * the exact same script text without exposing any private environment values.
 */
function RuntimeEnvScript() {
  const existing = (globalThis as { __LM_ENV__?: Record<string, string> })
    .__LM_ENV__;
  const env: Record<string, string> = existing ? { ...existing } : {};

  if (!existing) {
    for (const key of PUBLIC_ENV_KEYS) {
      const alias = key.startsWith("VITE_")
        ? `NEXT_PUBLIC_${key.slice(5)}`
        : `VITE_${key.replace(/^NEXT_PUBLIC_/, "")}`;
      const value = process.env[key] || process.env[alias];
      if (value) env[key] = value;
    }
  }

  const json = JSON.stringify(env).replace(/</g, "\\u003c");
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `globalThis.__LM_ENV__=${json};`,
      }}
    />
  );
}
