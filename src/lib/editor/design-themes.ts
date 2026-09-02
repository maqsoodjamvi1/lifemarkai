export type ThemePack = {
  id: string;
  name: string;
  fontSans: string;
  radiusPx: number;
  colors: Record<string, string>;
};

/** Full theme packs for Design View (colors + type + radius). */
export const DESIGN_THEME_PACKS: ThemePack[] = [
  {
    id: "violet",
    name: "Violet",
    fontSans: "Inter",
    radiusPx: 8,
    colors: {
      primary: "#7c3aed",
      secondary: "#6b7280",
      accent: "#f59e0b",
      destructive: "#ef4444",
      background: "#ffffff",
      foreground: "#09090b",
      muted: "#f4f4f5",
      border: "#e4e4e7",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    fontSans: "Geist",
    radiusPx: 10,
    colors: {
      primary: "#38bdf8",
      secondary: "#64748b",
      accent: "#a78bfa",
      destructive: "#f43f5e",
      background: "#0b1220",
      foreground: "#f8fafc",
      muted: "#1e293b",
      border: "#334155",
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    fontSans: "DM Sans",
    radiusPx: 4,
    colors: {
      primary: "#111827",
      secondary: "#6b7280",
      accent: "#b45309",
      destructive: "#b91c1c",
      background: "#fffbeb",
      foreground: "#1c1917",
      muted: "#fef3c7",
      border: "#e7e5e4",
    },
  },
  {
    id: "saas",
    name: "SaaS",
    fontSans: "Plus Jakarta Sans",
    radiusPx: 12,
    colors: {
      primary: "#2563eb",
      secondary: "#64748b",
      accent: "#06b6d4",
      destructive: "#dc2626",
      background: "#ffffff",
      foreground: "#0f172a",
      muted: "#f1f5f9",
      border: "#e2e8f0",
    },
  },
];

export const CLOUD_SUBTABS: Record<string, string> = {
  env: "env",
  secrets: "secrets",
  customemail: "emails",
  email: "emails",
  storage: "storage",
  appauth: "auth",
  edgefn: "edge",
  dbmanager: "database",
  schema: "database",
  dbquery: "database",
};

export function announceCloudSubtab(subtab: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("lifemark-cloud-tab", subtab);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("lifemark-cloud-open-tab", { detail: subtab }));
}
