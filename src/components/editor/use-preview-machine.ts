import { useCallback,useRef,useState } from "react";
import type { PreviewEngine } from "@/lib/preview/resolve-preview-engine";

export type PreviewMachineState =
  | "idle"
  | "building"
  | "loading"
  | "ready"
  | "error"
  | "unavailable";

export type PreviewMachineTransition = {
  from: PreviewMachineState;
  to: PreviewMachineState;
  reason: string;
  engine: PreviewEngine;
  buildSha: string;
  at: number;
};

export function usePreviewMachine(
  engine: PreviewEngine,
  onTransition?: (transition: PreviewMachineTransition) => void,
) {
  const [previewMachineState, setPreviewMachineState] =
    useState<PreviewMachineState>("idle");
  const previewBuildShaRef = useRef("");
  const previewEngineRef = useRef(engine);
  const onTransitionRef = useRef(onTransition);
  previewEngineRef.current = engine;
  onTransitionRef.current = onTransition;

  const transitionPreviewMachine = useCallback(
    (next: PreviewMachineState, reason: string) => {
      setPreviewMachineState((previous) => {
        if (previous === next) return previous;
        const transition: PreviewMachineTransition = {
          from: previous,
          to: next,
          reason,
          engine: previewEngineRef.current,
          buildSha: previewBuildShaRef.current,
          at: Date.now(),
        };
        queueMicrotask(() => {
          window.dispatchEvent(
            new CustomEvent("lifemark-preview-machine-transition", {
              detail: transition,
            }),
          );
          onTransitionRef.current?.(transition);
        });
        return next;
      });
    },
    [],
  );

  return {
    previewMachineState,
    previewBuildShaRef,
    previewEngineRef,
    transitionPreviewMachine,
  };
}
