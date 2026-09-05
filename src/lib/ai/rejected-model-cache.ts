/** Short-lived negative cache; retry model availability after the TTL. */
export function createRejectedModelCache(now = Date.now, ttlMs = 300_000, limit = 128) {
  const rejected = new Map<string, number>();
  return {
    has(model: string): boolean {
      const expires = rejected.get(model);
      if (expires === undefined) return false;
      if (expires <= now()) { rejected.delete(model); return false; }
      return true;
    },
    add(model: string): void {
      rejected.delete(model);
      rejected.set(model, now() + ttlMs);
      while (rejected.size > limit) rejected.delete(rejected.keys().next().value!);
    },
  };
}
