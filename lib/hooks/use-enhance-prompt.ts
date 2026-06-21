"use client";

/**
 * Client hook for the prompt enhancer (POST /api/ai/enhance).
 * Adapted from bolt.diy's usePromptEnhancer — turns a rough prompt into a
 * precise build prompt. Falls back to the original on any failure.
 *
 * Usage:
 *   const { enhance, enhancing } = useEnhancePrompt();
 *   const better = await enhance(input);
 *   setInput(better);
 */
import { useCallback, useState } from "react";

export function useEnhancePrompt() {
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enhance = useCallback(async (prompt: string): Promise<string> => {
    if (!prompt.trim()) return prompt;
    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as { enhanced?: string; error?: string };
      if (data.error) setError(data.error);
      return data.enhanced?.trim() || prompt;
    } catch (err) {
      setError(err instanceof Error ? err.message : "enhance failed");
      return prompt;
    } finally {
      setEnhancing(false);
    }
  }, []);

  return { enhance, enhancing, error };
}
