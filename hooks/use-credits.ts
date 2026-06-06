"use client";

import { useState, useCallback } from "react";
import { toast } from "./use-toast";

export function useCredits(initialCredits: number) {
  const [credits, setCredits] = useState(initialCredits);
  const [isLow, setIsLow] = useState(initialCredits < 20);

  const deduct = useCallback((amount: number) => {
    setCredits((prev) => {
      const next = Math.max(0, prev - amount);
      if (next < 20 && prev >= 20) {
        toast({
          title: "Low credits",
          description: `You have ${next} credits remaining. Upgrade to continue.`,
          variant: "destructive",
        });
        setIsLow(true);
      }
      return next;
    });
  }, []);

  const add = useCallback((amount: number) => {
    setCredits((prev) => {
      const next = prev + amount;
      if (next >= 20) setIsLow(false);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/credits");
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits);
        setIsLow(data.credits < 20);
      }
    } catch {
      // Silently fail
    }
  }, []);

  return { credits, isLow, deduct, add, refresh };
}
