// Adapted from shadcn/ui toast hook
import { useCallback, useEffect, useState } from "react";

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  duration?: number;
}

let toastCount = 0;

// Simple in-memory toast state (lifted to module level for cross-component access)
const listeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function dispatch(toast: Toast) {
  toasts = [...toasts, toast];
  listeners.forEach((l) => l(toasts));

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    listeners.forEach((l) => l(toasts));
  }, toast.duration ?? 4000);
}

// Standalone toast function (can be called outside React components)
export function toast(props: Omit<Toast, "id">) {
  dispatch({ ...props, id: `toast-${++toastCount}` });
}

export function useToast() {
  const [mountedToasts, setMountedToasts] = useState<Toast[]>(toasts);

  useEffect(() => {
    listeners.push(setMountedToasts);
    setMountedToasts(toasts);

    return () => {
      const idx = listeners.indexOf(setMountedToasts);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  const toastFn = useCallback((props: Omit<Toast, "id">) => {
    dispatch({ ...props, id: `toast-${++toastCount}` });
  }, []);

  return { toast: toastFn, toasts: mountedToasts };
}
