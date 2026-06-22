// @ts-check
import { fileURLToPath } from "url";
import path from "path";

// ESM-safe __dirname — works in .mjs without needing "type":"module" in package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Wildcard host for built-app temporary URLs: {slug}-{projectId}.apps.lifemarkai.com
// A host-based rewrite (see `rewrites()` below) maps these to the existing
// /preview/[projectId] renderer so every built app is served from this server.
// Override the base with LIFEMARK_APPS_DOMAIN.
const APPS_DOMAIN = (process.env.LIFEMARK_APPS_DOMAIN ?? "apps.lifemarkai.com").replace(/\./g, "\\.");
const UUID_RE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

// WebContainers fetch assets from StackBlitz CDNs and serve preview iframes on webcontainer.io.
const webContainerConnectSrc =
  " https://*.staticblitz.com https://*.webcontainer.io https://*.webcontainer-api.io https://*.stackblitz.io https://*.stackblitz.com https://stackblitz.io https://stackblitz.com wss://*.webcontainer.io wss://*.webcontainer-api.io";
const webContainerFrameSrc =
  " https://*.webcontainer.io https://*.webcontainer-api.io https://*.staticblitz.com https://*.stackblitz.io https://*.stackblitz.com https://stackblitz.io https://stackblitz.com";
const webContainerScriptSrc =
  " https://*.staticblitz.com https://*.webcontainer.io https://*.webcontainer-api.io https://*.stackblitz.io https://*.stackblitz.com https://stackblitz.io https://stackblitz.com";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monaco editor must not be bundled server-side (Next.js 16 syntax)
  serverExternalPackages: ["monaco-editor"],

  // Pin Turbopack's workspace root to THIS project directory so it doesn't
  // pick up d:\Projects\package-lock.json and emit the "multiple lockfiles" warning.
  turbopack: {
    root: __dirname,
  },

  // Serve each built app from its temporary subdomain. Requests to
  // {slug}-{projectId}.apps.lifemarkai.com are rewritten to the existing
  // /preview/[projectId] renderer (exact id lookup). The main site, www, and
  // the sslip.io host don't match this rule and pass through untouched.
  async rewrites() {
    return {
      beforeFiles: [
        {
          // Exclude paths the preview renderer already owns (its own assets) and
          // framework paths, so they resolve directly instead of being re-prefixed.
          source: "/:path((?!preview/|api/|_next/).*)",
          has: [
            { type: "host", value: `.*-(?<pid>${UUID_RE})\\.${APPS_DOMAIN}` },
          ],
          destination: "/preview/:pid/:path",
        },
      ],
    };
  },

  async headers() {
    return [
      {
        // WebContainers (SharedArrayBuffer) require strict cross-origin isolation on editor routes.
        source: "/editor/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        // Exclude /_next/static so we don't interfere with Next.js's own
        // cache-control headers for static assets.
        source: "/((?!_next/static).*)",
        headers: [
          { key: "X-Frame-Options",        value: "SAMEORIGIN"                      },
          { key: "X-Content-Type-Options", value: "nosniff"                         },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdnjs.cloudflare.com https://unpkg.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net" + webContainerScriptSrc,
              "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://api.stripe.com blob: https://cdn.jsdelivr.net" + webContainerConnectSrc,
              "frame-src 'self' blob: data:" + webContainerFrameSrc,
              "worker-src 'self' blob:" + webContainerFrameSrc,
              "child-src 'self' blob: data:",
            ].join("; "),
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co"               },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com"    },
    ],
  },
};

export default nextConfig;
