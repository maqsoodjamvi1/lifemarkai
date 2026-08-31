/**
 * Typed contract for the editor's `window` CustomEvent bus.
 *
 * A fragility audit set out to find "the top bar and preview panel talk via
 * untyped window events" and turned into something much bigger once every
 * call site was actually counted: 31 distinct `lifemark-*` event names,
 * ~81 dispatch/listen call sites, spread across 10 files — effectively the
 * whole editor's cross-component messaging backbone (preview navigation,
 * heal/retry state, annotations undo/redo, screenshots, deploy status, the
 * intelligence panel, the diff viewer, and more).
 *
 * Migrating all 81 call sites to a typed store was judged too large and too
 * risky to do without live browser verification (which wasn't available) —
 * a mistake in event-name or payload plumbing for, say, preview navigation
 * or heal-retry would be a regression in core editor functionality with no
 * way to catch it before shipping. So the 81 existing call sites are left
 * exactly as they are, still using raw `window.dispatchEvent(new
 * CustomEvent(...))` / `window.addEventListener(...)`.
 *
 * What THIS module is: a compile-time-checked registry of every event name
 * and its real payload shape (reverse-engineered from how each one is
 * actually constructed and read today — see
 * preview-events-registry.test.ts, which pins every entry against a literal
 * list so a future edit here can't silently drop or typo one). `dispatch`/
 * `listen` are optional, purely additive helpers: new code can use them to
 * get a typo'd event name or a malformed payload caught by `tsc` instead of
 * silently no-op'ing at runtime — the exact failure mode the original
 * audit finding was about. Nothing here changes runtime behavior for the
 * 81 existing sites; this is deliberately NOT a migration.
 */

export interface PreviewEventPayloads {
  "lifemark-preview-status": { text: string | null };
  "lifemark-preview-path": { path?: string; device?: string; canGoBack?: boolean; canGoForward?: boolean };
  "lifemark-preview-pages": Array<{ label: string; path: string }>;
  "lifemark-live-preview-url": { url: string | null };
  "lifemark-preview-history": { dir: "back" | "forward" };
  "lifemark-preview-device": "desktop" | "mobile" | "tablet";
  "lifemark-preview-navigate": { pathname: string };
  "lifemark-refresh-preview": { files?: unknown[]; reason?: string } | undefined;
  "lifemark-exit-version-preview": undefined;
  "lifemark-preview-version": { snapshotId: string; label: string };
  "lifemark-preview-heal-start": undefined;
  "lifemark-preview-heal-done": undefined;
  "lifemark-preview-heal-failed": undefined;
  "lifemark-preview-settled": { ok: boolean };
  "lifemark-preview-reverting": undefined;
  "lifemark-show-preview-toolbar": undefined;
  "lifemark-request-screenshot": { messageId: string };
  "lifemark-screenshot-ready": { messageId: string; dataUrl: string };
  "lifemark-jump-to-comment-element": { commentId?: string; xpath?: string; pagePath?: string | null };
  "lifemark-preview-annotations-clear": undefined;
  "lifemark-preview-annotations-undo": undefined;
  "lifemark-preview-annotations-redo": undefined;
  "lifemark-preview-annotations-meta": { count?: number; canUndo?: boolean; canRedo?: boolean };
  "lifemark-free-edit-quota": undefined;
  "lifemark-files-changed": { projectId?: string };
  "lifemark-intelligence-done": { projectId?: string; summary?: string; changedPaths?: string[]; ok?: boolean };
  "lifemark-intelligence-run": { goal: string; fromChat?: boolean };
  "lifemark-deploy-started": undefined;
  "lifemark-open-file-at-line": { path: string; line: number };
  "lifemark-open-diff": { oldSnapshotId: string; newSnapshotId: string; projectId: string };
  "lifemark-seed-browser-tests": { description?: string; autoGenerate?: boolean };
}

export type PreviewEventName = keyof PreviewEventPayloads;

/**
 * Dispatch a `window` CustomEvent with a compile-time-checked name and
 * payload. Behaviorally identical to `window.dispatchEvent(new
 * CustomEvent(name, { detail }))` — same event, same bubbling (none, matches
 * existing usage), same listeners react to it whether they use `listen`
 * below or the existing raw `addEventListener`.
 */
export function dispatch<K extends PreviewEventName>(
  ...args: PreviewEventPayloads[K] extends undefined ? [name: K] : [name: K, detail: PreviewEventPayloads[K]]
): void {
  const [name, detail] = args;
  window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
}

/**
 * Listen for a `window` CustomEvent with a compile-time-checked name and
 * typed handler. Returns the cleanup function directly, matching the
 * `useEffect(() => { ...; return () => ... }, [])` shape every existing
 * call site already uses.
 */
export function listen<K extends PreviewEventName>(
  name: K,
  handler: (detail: PreviewEventPayloads[K]) => void,
): () => void {
  const wrapped = (e: Event) => handler((e as CustomEvent<PreviewEventPayloads[K]>).detail);
  window.addEventListener(name, wrapped);
  return () => window.removeEventListener(name, wrapped);
}
