const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,61}$/;

export function isSafeBucketName(name: string): boolean {
  return typeof name === "string" && BUCKET_RE.test(name);
}

/** Object path inside a bucket: no traversal, no leading slash. */
export function isSafeObjectPath(path: string): boolean {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false;
  if (path.startsWith("/") || path.includes("\\") || path.includes("..")) return false;
  return !path.split("/").includes("");
}
