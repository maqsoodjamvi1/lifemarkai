
import { useCallback,useEffect,useState } from "react";
import type {
WorkspaceEnforceSettings,
WorkspaceScimConfig,
WorkspaceSsoConfig,
} from "@/lib/workspace/identity";

interface WorkspaceIdentityState {
  loading: boolean;
  sso: WorkspaceSsoConfig | null;
  scim: (WorkspaceScimConfig & { apiKeyPrefix?: string | null }) | null;
  enforceSettings: WorkspaceEnforceSettings;
  verifiedDomains: string[];
  scimBaseUrl: string;
}

const DEFAULT_ENFORCE: WorkspaceEnforceSettings = {
  enforceSso: false,
  ssoSessionDuration: "24h",
  jitEnabled: true,
  jitDefaultRole: "editor",
};

export function useWorkspaceIdentity() {
  const [state, setState] = useState<WorkspaceIdentityState>({
    loading: true,
    sso: null,
    scim: null,
    enforceSettings: DEFAULT_ENFORCE,
    verifiedDomains: [],
    scimBaseUrl: "/api/scim/v2",
  });

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch("/api/workspace/identity");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setState({
        loading: false,
        sso: data.sso ?? null,
        scim: data.scim ?? null,
        enforceSettings: data.enforceSettings ?? DEFAULT_ENFORCE,
        verifiedDomains: data.verifiedDomains ?? [],
        scimBaseUrl: data.scimBaseUrl ?? "/api/scim/v2",
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch("/api/workspace/identity", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Save failed");
    // `data.sso ?? s.sso` can't tell "the server omitted this field" (keep
    // the previous value) apart from "the server returned it as null"
    // (e.g. after a delete — redactSsoForClient(null) genuinely returns
    // null) — both fall through `??` to the fallback, so a clearing PATCH
    // response gets silently ignored and this hook's local state stays
    // stale. `in` checks whether the key was actually present in the
    // response instead of inferring it from the value.
    setState((s) => ({
      ...s,
      sso: "sso" in data ? data.sso : s.sso,
      scim: "scim" in data ? data.scim : s.scim,
      enforceSettings: "enforceSettings" in data ? data.enforceSettings : s.enforceSettings,
    }));
    return data as { scimApiKey?: string };
  }, []);

  return { ...state, reload, patch };
}
