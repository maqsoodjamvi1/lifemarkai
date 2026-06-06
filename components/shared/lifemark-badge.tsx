"use client";

/**
 * LifemarkBadge — "Built with LifemarkAI" viral attribution badge.
 *
 * Floats in the bottom-right corner of every published app.
 * Pro users can hide it via project settings (badge_hidden = true).
 *
 * Clicking it opens lifemarkai.app with a utm referral so we can track
 * how many signups come via the badge.
 */

import { useState } from "react";

interface LifemarkBadgeProps {
  /** When true the badge is not rendered (Pro feature) */
  hidden?: boolean;
  /** Project slug / id for referral tracking */
  projectRef?: string;
  /** Visual style — "dark" (default) or "light" */
  theme?: "dark" | "light";
  className?: string;
}

export function LifemarkBadge({
  hidden = false,
  projectRef,
  theme = "dark",
  className = "",
}: LifemarkBadgeProps) {
  const [hovered, setHovered] = useState(false);

  if (hidden) return null;

  const href =
    `https://lifemarkai.app` +
    (projectRef ? `?ref=${encodeURIComponent(projectRef)}&utm_source=badge&utm_medium=app` : "?utm_source=badge&utm_medium=app");

  const isDark = theme === "dark";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Built with LifemarkAI"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: hovered ? "6px 12px 6px 8px" : "6px 8px",
        borderRadius: "999px",
        backgroundColor: isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
        textDecoration: "none",
        transition: "all 0.18s ease",
        cursor: "pointer",
        overflow: "hidden",
        maxWidth: hovered ? "180px" : "32px",
      }}
      className={className}
    >
      {/* Logo mark */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M12 2L2 7L12 12L22 7L12 2Z"
          fill={isDark ? "#a78bfa" : "#7c3aed"}
        />
        <path
          d="M2 17L12 22L22 17"
          stroke={isDark ? "#a78bfa" : "#7c3aed"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 12L12 17L22 12"
          stroke={isDark ? "#c4b5fd" : "#8b5cf6"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Label — revealed on hover */}
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.01em",
          color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)",
          whiteSpace: "nowrap",
          opacity: hovered ? 1 : 0,
          maxWidth: hovered ? "140px" : 0,
          transition: "opacity 0.18s ease, max-width 0.18s ease",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        Built with LifemarkAI
      </span>
    </a>
  );
}

/**
 * Raw HTML string for the badge — injected into deployed app HTML files.
 * Self-contained: no React, no external deps, works in any browser.
 * Re-exported from lib/badge.ts so API routes can import it without
 * pulling in React/"use client" into server-side bundles.
 */
export { getBadgeHtml } from "@/lib/badge";
