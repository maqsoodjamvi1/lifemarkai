/**
 * Who may download or export a project's source (gap #10).
 *
 * Lovable added a "Code downloads" restriction on 1 July: when an admin disables it,
 * only owners/admins can pull the source. We had nothing — anyone with editor access
 * could export, and there was no setting to change that.
 *
 * The policy lives on the PROJECT OWNER's profile (`profiles.allow_code_download`),
 * not on the downloading user, because it is the owner's intellectual property being
 * protected. A collaborator cannot lift their own restriction by changing their own
 * settings, which they could if the flag were read from the caller.
 *
 * Defaults to allowed. This is a restriction being made available, not a capability
 * being removed — flipping the default would silently break every existing user's
 * export button the moment this deployed.
 */

export interface DownloadPolicyResult {
  allowed: boolean;
  /** Why it was refused, suitable for showing the user. */
  reason?: string;
}

/**
 * Decide whether `requesterId` may export the project owned by `ownerId`.
 *
 * The owner is always allowed — a setting that locked an owner out of their own
 * source would be a bug dressed as a feature.
 */
export async function canDownloadProjectCode(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: unknown) => { maybeSingle: () => Promise<{ data: unknown }> };
      };
    };
  },
  opts: { ownerId: string; requesterId: string },
): Promise<DownloadPolicyResult> {
  if (opts.ownerId === opts.requesterId) return { allowed: true };

  const { data } = await supabase
    .from("profiles")
    .select("allow_code_download")
    .eq("id", opts.ownerId)
    .maybeSingle();

  // Unknown profile or missing column → allow. Failing OPEN is deliberate here:
  // this protects source code, not credentials, and a read failure silently
  // breaking a legitimate export is a worse outcome than one unrestricted download.
  // The inverse choice would make an unrelated database hiccup look like a
  // permissions bug.
  const row = data as { allow_code_download?: boolean } | null;
  if (!row || row.allow_code_download !== false) return { allowed: true };

  return {
    allowed: false,
    reason:
      "The project owner has disabled code downloads for collaborators. Ask them to enable it in workspace settings, or to export it for you.",
  };
}
