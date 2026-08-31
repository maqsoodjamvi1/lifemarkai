/**
 * Guards Stripe (and any similar) `success_url`/`cancel_url` redirect
 * targets supplied by an unauthenticated caller.
 *
 * src/routes/api/embed/checkout.ts is a public, CORS-open endpoint called
 * directly from a generated app's own visitor's browser — the caller is
 * never anyone the route can vouch for. Its `successUrl`/`cancelUrl` body
 * fields used to be passed straight to Stripe with no check. Either one can
 * point anywhere, and Stripe redirects the customer's browser there after a
 * REAL, completed payment — so a crafted successUrl gets an attacker a
 * legitimate post-payment redirect to a phishing page, worse than a
 * generic open redirect since the victim just finished a real Stripe
 * checkout and is primed to trust whatever comes next. Only a redirect
 * target that's same-origin as the app the checkout is actually for should
 * ever be honored.
 */
export function isSameOriginRedirect(candidate: string | undefined, appUrl: string): boolean {
  if (!candidate) return false;
  try {
    return new URL(candidate).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
