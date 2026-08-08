
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
    setState((s) => ({
      ...s,
      sso: data.sso ?? s.sso,
      scim: data.scim ?? s.scim,
      enforceSettings: data.enforceSettings ?? s.enforceSettings,
    }));
    return data as { scimApiKey?: string };
  }, []);

  return { ...state, reload, patch };
}
