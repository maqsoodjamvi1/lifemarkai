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
  // Mirrors `previewMachineState` outside React's state so
  // transitionPreviewMachine can read "previous" without a functional
  // setState updater — see the comment below for why.
  const previewMachineStateRef = useRef<PreviewMachineState>("idle");

  const transitionPreviewMachine = useCallback(
    (next: PreviewMachineState, reason: string) => {
      // The transition/dispatch side effects used to live INSIDE the
      // setPreviewMachineState functional updater. React does not guarantee
      // an updater runs exactly once per call — StrictMode double-invokes it
      // in development, and concurrent rendering can replay it — so the
      // CustomEvent dispatch and onTransition callback could fire twice for
      // one logical transition, double-logging every preview state change.
      // Reading/writing a ref instead of relying on the updater's `previous`
      // argument keeps the side effects to a single call site that only ever
      // runs once per transitionPreviewMachine invocation.
      const previous = previewMachineStateRef.current;
      if (previous === next) return;
      previewMachineStateRef.current = next;
      setPreviewMachineState(next);

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
