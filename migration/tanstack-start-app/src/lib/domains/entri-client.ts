/**
 * Entri client SDK loader — the browser half of the connect-a-domain flow.
 *
 * The server half has been complete for some time: `/api/domains/entri` mints a
 * short-lived Entri token and returns the DNS records a domain needs. Nothing
 * ever called it. The domains panel only spoke to `/api/domains` and
 * `/api/domains/verify`, so the one-click flow existed end-to-end on the server
 * and was unreachable from the product — every user copied DNS records by hand.
 *
 * Entri detects the user's DNS provider, asks them to sign in, and writes the
 * records for them. It is the difference between "paste four records into your
 * registrar" and "click connect", and it is the main thing that made Lovable's
 * domain step feel like one step.
 *
 * SDK shape verified against developers.entri.com/docs/install: the script at
 * cdn.goentri.com/entri.js exposes `window.entri.showUnify(config)`.
 */

export interface EntriDnsRecord {
  type: string;
  host: string;
  value: string;
  ttl: number;
}

export interface EntriLaunchConfig {
  applicationId: string;
  token: string;
  prefilledDomain?: string;
  dnsRecords: EntriDnsRecord[];
}

export interface EntriResult {
  /** True when Entri reports the records were written successfully. */
  success: boolean;
}

const SDK_URL = "https://cdn.goentri.com/entri.js";

type EntriGlobal = {
  showUnify?: (config: Record<string, unknown>) => void;
};

function existingEntri(): EntriGlobal | null {
  const w = window as unknown as { entri?: EntriGlobal };
  return w.entri ?? null;
}

let loading: Promise<EntriGlobal | null> | null = null;

/**
 * Load the SDK once per page. Concurrent callers share one promise, so
 * double-clicking Connect cannot inject the script twice.
 */
export function loadEntrySdk(): Promise<EntriGlobal | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const already = existingEntri();
  if (already?.showUnify) return Promise.resolve(already);
  if (loading) return loading;

  loading = new Promise<EntriGlobal | null>((resolve) => {
    const done = () => resolve(existingEntri());
    const prior = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    if (prior) {
      prior.addEventListener("load", done, { once: true });
      prior.addEventListener("error", () => resolve(null), { once: true });
      // The script may already have finished before we attached a listener.
      if (existingEntri()?.showUnify) resolve(existingEntri());
      return;
    }
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.addEventListener("load", done, { once: true });
    // A blocked or offline CDN resolves null rather than rejecting, so the
    // caller falls back to manual DNS records instead of showing an error for
    // something the user cannot act on.
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.appendChild(script);
  });

  return loading;
}

/**
 * Open the Entri modal. Resolves when the user finishes or closes it.
 *
 * Resolves `null` when the SDK could not load — meaning "fall back to manual
 * records", which is different from "the user declined" and must stay
 * distinguishable at the call site.
 */
export async function launchEntri(config: EntriLaunchConfig): Promise<EntriResult | null> {
  const entri = await loadEntrySdk();
  // Captured after the guard: the narrowing from `entri?.showUnify` does not
  // survive into the promise callback below.
  const showUnify = entri?.showUnify;
  if (!showUnify) return null;

  return new Promise<EntriResult>((resolve) => {
    let settled = false;
    const settle = (success: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ success });
    };
    try {
      showUnify({
        applicationId: config.applicationId,
        token: config.token,
        prefilledDomain: config.prefilledDomain,
        dnsRecords: config.dnsRecords,
        onSuccess: () => settle(true),
        // Closing without finishing is not a failure to report — the domain is
        // already saved and the manual records are on screen behind the modal.
        onEntriClose: () => settle(false),
      });
    } catch {
      settle(false);
    }
  });
}
