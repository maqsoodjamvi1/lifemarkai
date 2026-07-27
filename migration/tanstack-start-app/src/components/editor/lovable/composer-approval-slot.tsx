
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  LovableConnectorApprovalCard,
  type ConnectorApprovalRequest,
} from "./connector-approval-card";
import { LovableCloudOpsCard, type CloudActionRequest } from "./cloud-ops-card";

interface LovableComposerApprovalSlotProps {
  projectId: string;
  connectorApproval: ConnectorApprovalRequest | null;
  onConnectorApprovalClear: () => void;
  cloudAction: CloudActionRequest | null;
  onCloudActionClear: () => void;
  cloudTierPick: string;
  onCloudTierPick: (tier: string) => void;
  onRetryAgent: (prompt: string) => void;
}

/** Connector + cloud approval cards with built-in API handlers (Lovable parity). */
export function LovableComposerApprovalSlot({
  projectId,
  connectorApproval,
  onConnectorApprovalClear,
  cloudAction,
  onCloudActionClear,
  cloudTierPick,
  onCloudTierPick,
  onRetryAgent,
}: LovableComposerApprovalSlotProps) {
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [cloudActionBusy, setCloudActionBusy] = useState(false);

  return (
    <>
      {connectorApproval && (
        <LovableConnectorApprovalCard
          approval={connectorApproval}
          busy={approvalBusy}
          onAllow={async (decision) => {
            setApprovalBusy(true);
            try {
              const res = await fetch(`/api/projects/${projectId}/connector-permissions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ connector: connectorApproval.connector, decision }),
              });
              if (!res.ok) throw new Error();
              const retry = connectorApproval.retryPrompt;
              onConnectorApprovalClear();
              onRetryAgent(retry);
            } catch {
              toast({ title: "Couldn't save the approval", variant: "destructive" });
            } finally {
              setApprovalBusy(false);
            }
          }}
          onNeverAllow={() => {
            void fetch(`/api/projects/${projectId}/connector-permissions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ connector: connectorApproval.connector, decision: "never" }),
            });
            onConnectorApprovalClear();
          }}
          onSkip={onConnectorApprovalClear}
        />
      )}

      {cloudAction && (
        <LovableCloudOpsCard
          action={cloudAction}
          tierPick={cloudTierPick}
          busy={cloudActionBusy}
          onTierPick={onCloudTierPick}
          onConfirm={async () => {
            setCloudActionBusy(true);
            try {
              const res =
                cloudAction.kind === "resize"
                  ? await fetch("/api/cloud/provision", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ projectId, instance: cloudTierPick }),
                    })
                  : await fetch("/api/cloud/pause", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        projectId,
                        action: cloudAction.kind === "pause" ? "pause" : "wake",
                      }),
                    });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error((body as { error?: string }).error ?? "Request failed");
              toast({
                title:
                  cloudAction.kind === "resize"
                    ? `Instance resizing to ${cloudTierPick}`
                    : cloudAction.kind === "pause"
                      ? "Cloud backend paused"
                      : "Cloud backend waking up",
                description:
                  cloudAction.kind === "resize"
                    ? "Takes a few minutes; the backend is briefly unavailable."
                    : undefined,
              });
              onCloudActionClear();
            } catch (err) {
              toast({
                title: "Cloud action failed",
                description: err instanceof Error ? err.message : undefined,
                variant: "destructive",
              });
            } finally {
              setCloudActionBusy(false);
            }
          }}
          onCancel={onCloudActionClear}
        />
      )}
    </>
  );
}
