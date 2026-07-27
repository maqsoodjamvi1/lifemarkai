/**
 * useFeatureFlag — minimal stub.
 *
 * feature-flags-panel.tsx imports this, but the hook file is absent from the
 * source Next.js repo too (pre-existing broken import — the panel mainly ships
 * reference code for the USER's generated app via its HOOK_CODE string). This
 * stub satisfies the import so the migration app stays resolve-clean.
 *
 * Replace with the real flag source (context/query) when wiring the panel.
 */
export function useFeatureFlag(_key: string): boolean {
  return false;
}
