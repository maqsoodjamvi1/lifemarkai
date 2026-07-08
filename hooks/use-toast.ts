// Toast API — Sonner-backed shim.
//
// Historically LifemarkAI shipped a bespoke in-memory toast store. This module
// preserves the exact same public API — `toast({ title, description, variant })`
// and `useToast()` — but routes every call to Sonner, so all existing call
// sites keep working unchanged while gaining Lovable-parity toast visuals.
import { toast as sonnerToast } from "sonner";

export interface Toast {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
}

/** Standalone toast — safe to call outside React components. */
export function toast(props: Omit<Toast, "id">): void {
  const { title, description, variant, duration } = props;
  const message = title ?? description ?? "";
  // When only a description was supplied, promote it to the message line.
  const options = {
    description: title ? description : undefined,
    duration,
  };
  if (variant === "destructive") {
    sonnerToast.error(message, options);
  } else {
    sonnerToast(message, options);
  }
}

/**
 * Hook form kept for backwards compatibility. `toasts` is retained (empty) so
 * legacy consumers that destructured it don't break; Sonner renders its own
 * queue via the <Toaster /> in the root layout.
 */
export function useToast() {
  return { toast, toasts: [] as Toast[] };
}
