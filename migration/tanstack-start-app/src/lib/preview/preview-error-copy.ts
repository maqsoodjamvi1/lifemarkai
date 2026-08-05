/**
 * Turn a raw sandbox-provider error into something a customer can act on.
 *
 * The provider's error strings are written for us, not for them. They name the
 * container runtime, the environment variables that are missing, the host port
 * range that is exhausted, and sometimes carry the Docker daemon's own JSON
 * body verbatim. Putting those on screen in production does three bad things
 * at once: it tells the user about infrastructure they did not buy and cannot
 * fix, it reads as "this product is broken" rather than "try again", and it
 * discloses our topology to anyone who can open a project.
 *
 * The preview panel's other failure pane already had the right instinct —
 * environment-variable detail is gated behind `NODE_ENV === "development"`
 * with the note "end users get a generic message that never reveals the
 * underlying technology". This module is that policy, applied to the errors
 * rather than to one pane, so it cannot drift again.
 *
 * The mapping is not censorship: several of these failures ARE the user's to
 * fix — a broken `package.json`, a dev server that never listens — and the
 * generic message hid that just as badly as the raw one exposed too much.
 * Each entry says which side of that line it falls on via `blame`.
 */

export type PreviewErrorBlame = "project" | "platform";

export interface PreviewErrorCopy {
  /** Headline for the failure pane. */
  title: string;
  /** One or two sentences, safe to show anyone. */
  description: string;
  /**
   * "project" — something about THIS app is wrong and the user can fix it,
   * so retrying without changing anything will fail the same way.
   * "platform" — ours; retrying is a reasonable thing to do.
   */
  blame: PreviewErrorBlame;
}

interface Rule {
  match: RegExp;
  copy: PreviewErrorCopy;
}

const RULES: Rule[] = [
  {
    // Host capacity or a missing deployment variable. Never the user's fault,
    // and never their business.
    match: /no free port|SANDBOX_PORT_RANGE|SANDBOX_PREVIEW_DOMAIN|SANDBOX_PUBLIC_HOST|docker (create|start) failed|no space left|cannot connect to the docker daemon/i,
    copy: {
      title: "Preview service is busy",
      description:
        "We couldn't get a preview environment right now. Your project and files are safe — try again in a moment.",
      blame: "platform",
    },
  },
  {
    match: /npm (install|ci) failed|ERESOLVE|peer dep|ENOTFOUND registry/i,
    copy: {
      title: "Dependencies couldn't be installed",
      description:
        "One of the packages your app asks for couldn't be installed. Check package.json for a package name or version that doesn't exist, then try again.",
      blame: "project",
    },
  },
  {
    match: /did not answer in time|dev server|OOMKilled|timed out waiting/i,
    copy: {
      title: "Your app didn't start",
      description:
        "The environment came up but your app never began serving. This is usually an error thrown while the app boots — ask the chat to check the startup code.",
      blame: "project",
    },
  },
  {
    match: /archive did not extract|is empty|no files|upload reported success/i,
    copy: {
      title: "Your files didn't reach the preview",
      description:
        "The project files didn't finish uploading to the preview environment. Try again — nothing was lost.",
      blame: "platform",
    },
  },
  {
    match: /already shut down|sandbox .*not found|container .*not found|expired/i,
    copy: {
      title: "Preview session expired",
      description:
        "The preview environment was reclaimed after being idle. Starting a fresh one takes a few seconds.",
      blame: "platform",
    },
  },
];

const FALLBACK: PreviewErrorCopy = {
  title: "Preview couldn't start",
  description:
    "Something stopped your app's preview from starting. Your project and files are safe — try again, and if it keeps happening ask the chat to look at the build.",
  blame: "platform",
};

export function describePreviewError(raw: string | null | undefined): PreviewErrorCopy {
  if (!raw || !raw.trim()) return FALLBACK;
  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.copy;
  }
  return FALLBACK;
}

/**
 * Should the raw provider text and boot log be shown?
 *
 * Only where a developer is looking at it. `import.meta.env.DEV` is passed in
 * rather than read here so this file stays a pure function with no bundler
 * coupling — which is also what makes it testable under `node --test`.
 */
export function shouldShowRawPreviewDiagnostics(isDev: boolean): boolean {
  return isDev === true;
}
