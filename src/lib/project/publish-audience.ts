/**
 * Who may view a published app (gap #7).
 *
 * WHAT WAS ACTUALLY BROKEN — worse than the "three coarse tiers" the comparison
 * report described. The publish panel offered Anyone / Workspace only / Private,
 * and its own FAQ said: choose Workspace access "so only authenticated workspace
 * members can visit the published app". On save it PATCHed
 * `{ visibility: websiteAccess }` to /api/projects/:id — a field that route does not
 * handle, against a column that does not exist. The value was dropped, nothing was
 * ever persisted, and nothing anywhere read it.
 *
 * So the product asked users to make an access-control decision, told them what it
 * would do, discarded the answer, and served every published app publicly. That is
 * the most consequential instance of this session's recurring defect: the others
 * mis-reported work, this one mis-reported who could see your app.
 *
 * WHAT THIS MODULE IS. One decision function, `evaluatePublishAudience`, plus the
 * persistence shape behind it. Migration 157 supplies `projects.publish_audience`
 * and `project_publish_grants`. Four modes:
 *
 *   public     anyone with the URL
 *   workspace  any authenticated member of the owner's workspace
 *   private    the owner only
 *   custom     the owner, plus the grants table: groups, named users, external
 *              emails (flagged is_external so a guest is never mistaken for a
 *              colleague)
 *
 * FAILS CLOSED. Unlike the code-download policy, which fails open because it
 * protects source rather than data, an unreadable audience here denies access. If we
 * cannot determine whether a viewer is allowed, the safe answer is no — the failure
 * mode of guessing "yes" is publishing someone's internal app to the internet.
 */

export type PublishAudience = "public" | "workspace" | "private" | "custom";

export const PUBLISH_AUDIENCES: PublishAudience[] = ["public", "workspace", "private", "custom"];

export function isPublishAudience(v: unknown): v is PublishAudience {
  return typeof v === "string" && (PUBLISH_AUDIENCES as string[]).includes(v);
}

export interface PublishGrant {
  group_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  is_external?: boolean;
}

export interface AudienceViewer {
  /** Null for an anonymous visitor. */
  userId: string | null;
  email: string | null;
  /** Workspace/org the viewer belongs to, if any. */
  workspaceOwnerId?: string | null;
  /** Group ids the viewer is a member of. */
  groupIds?: string[];
}

export interface AudienceDecision {
  allowed: boolean;
  /** Which rule decided it — for logging, and for an honest denial message. */
  reason:
    | "public"
    | "owner"
    | "workspace-member"
    | "granted-group"
    | "granted-user"
    | "granted-email"
    | "not-signed-in"
    | "not-in-workspace"
    | "not-granted"
    | "private";
  /** Safe to show a visitor: never reveals who IS on the list. */
  message: string;
}

const DENIAL_MESSAGES: Record<string, string> = {
  "not-signed-in": "Sign in to view this app.",
  "not-in-workspace": "This app is restricted to its workspace members.",
  "not-granted": "You do not have access to this app.",
  private: "This app is private.",
};

function normalizeEmail(e: string | null | undefined): string | null {
  return e ? e.trim().toLowerCase() : null;
}

/**
 * Decide whether a viewer may load a published app.
 *
 * Pure and synchronous — the caller does the lookups. That keeps this cheap enough
 * to run on every request to a published app, and testable without a database.
 */
export function evaluatePublishAudience(opts: {
  audience: PublishAudience;
  ownerId: string;
  viewer: AudienceViewer;
  grants?: PublishGrant[];
}): AudienceDecision {
  const { audience, ownerId, viewer } = opts;
  const grants = opts.grants ?? [];

  if (audience === "public") {
    return { allowed: true, reason: "public", message: "" };
  }

  // The owner always gets in, under every mode. A setting that locked an owner out
  // of their own published app would be a bug wearing a feature's clothes.
  if (viewer.userId && viewer.userId === ownerId) {
    return { allowed: true, reason: "owner", message: "" };
  }

  if (audience === "private") {
    return { allowed: false, reason: "private", message: DENIAL_MESSAGES.private };
  }

  // Everything below needs an identity.
  if (!viewer.userId && !normalizeEmail(viewer.email)) {
    return { allowed: false, reason: "not-signed-in", message: DENIAL_MESSAGES["not-signed-in"] };
  }

  if (audience === "workspace") {
    const inWorkspace = !!viewer.workspaceOwnerId && viewer.workspaceOwnerId === ownerId;
    return inWorkspace
      ? { allowed: true, reason: "workspace-member", message: "" }
      : {
          allowed: false,
          reason: "not-in-workspace",
          message: DENIAL_MESSAGES["not-in-workspace"],
        };
  }

  // custom — the grants table decides.
  const viewerGroups = new Set(viewer.groupIds ?? []);
  const viewerEmail = normalizeEmail(viewer.email);

  for (const g of grants) {
    if (g.group_id && viewerGroups.has(g.group_id)) {
      return { allowed: true, reason: "granted-group", message: "" };
    }
    if (g.user_id && viewer.userId && g.user_id === viewer.userId) {
      return { allowed: true, reason: "granted-user", message: "" };
    }
    if (g.email && viewerEmail && normalizeEmail(g.email) === viewerEmail) {
      return { allowed: true, reason: "granted-email", message: "" };
    }
  }

  return { allowed: false, reason: "not-granted", message: DENIAL_MESSAGES["not-granted"] };
}

/**
 * Human summary of the current setting, for the publish panel.
 *
 * Written to be accurate about what is enforced — the old copy promised workspace
 * restriction that did not exist, and the fix is not just code but not saying that
 * again.
 */
export function describePublishAudience(
  audience: PublishAudience,
  grantCount = 0,
  externalCount = 0,
): string {
  switch (audience) {
    case "public":
      return "Anyone with the URL can view this app.";
    case "workspace":
      return "Only signed-in members of your workspace can view this app.";
    case "private":
      return "Only you can view this app.";
    case "custom": {
      if (grantCount === 0) {
        return "Custom access with no one added yet — only you can view this app.";
      }
      const ext = externalCount > 0 ? `, ${externalCount} external` : "";
      return `You plus ${grantCount} grantee${grantCount === 1 ? "" : "s"}${ext} can view this app.`;
    }
  }
}
