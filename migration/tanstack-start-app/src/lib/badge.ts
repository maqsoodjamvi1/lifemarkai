/**
 * getBadgeHtml — self-contained HTML/CSS string for the "Built with LifemarkAI" badge.
 * Injected into deployed app HTML files at build time.
 * No React, no external deps — works in any browser.
 *
 * @param projectRef   Project id — carried as `via_project` for attribution analytics.
 * @param hidden       When true, returns an empty string (paid badge removal).
 * @param referralCode The app owner's referral code. When present the badge links
 *                     to /signup?ref=<code>, so a converting click credits the
 *                     creator via the existing referral redemption flow
 *                     (signup → /auth/callback?ref= → /api/referral/redeem).
 */
export function getBadgeHtml(projectRef?: string, hidden = false, referralCode?: string | null): string {
  if (hidden) return "";

  const params = new URLSearchParams({ utm_source: "badge", utm_medium: "app" });
  if (referralCode) params.set("ref", referralCode);
  if (projectRef) params.set("via_project", projectRef);

  // Land on /signup so the referral code is redeemed on conversion. Without a
  // referral code there's nothing to redeem, so fall back to the homepage.
  const href = referralCode
    ? `https://lifemarkai.app/signup?${params.toString()}`
    : `https://lifemarkai.app/?${params.toString()}`;

  return `
<style>
#_lifemark-badge {
  position: fixed; bottom: 16px; right: 16px; z-index: 9999;
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; border-radius: 999px;
  background: rgba(0,0,0,0.82); backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 2px 12px rgba(0,0,0,0.25);
  text-decoration: none; cursor: pointer;
  transition: padding 0.18s ease, max-width 0.18s ease;
  overflow: hidden; max-width: 34px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
#_lifemark-badge:hover { padding: 6px 12px 6px 8px; max-width: 200px; }
#_lifemark-badge svg { flex-shrink: 0; }
#_lifemark-badge span {
  font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85);
  white-space: nowrap; opacity: 0; max-width: 0;
  transition: opacity 0.18s ease, max-width 0.18s ease;
}
#_lifemark-badge:hover span { opacity: 1; max-width: 160px; }
</style>
<a id="_lifemark-badge" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="Built with LifemarkAI">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#a78bfa"/>
    <path d="M2 17L12 22L22 17" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="#c4b5fd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span>Built with LifemarkAI</span>
</a>`.trim();
}
