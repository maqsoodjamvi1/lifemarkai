/**
 * next/dynamic shim for TanStack Start / Vite.
 *
 * The editor tree lazy-loads ~40 panels via `dynamic(factory, { ssr:false, loading })`.
 * Rather than rewrite every call site to React.lazy + <Suspense>, this shim keeps
 * the exact `next/dynamic` call shape and implements it with lazy()+Suspense:
 *
 *   - `ssr: false`   → naturally satisfied (lazy renders client-side under Suspense)
 *   - `loading`      → becomes the Suspense fallback
 *   - factory return → normalized: accepts a Component, `{ default }`, or a
 *     module whose default is the component (covers both `import(x)` and
 *     `import(x).then(m => m.Named)` factories used in the editor).
 *
 * Swap the 6 editor imports `import dynamic from "next/dynamic"` →
 * `import dynamic from "@/lib/next-dynamic"`. Everything else is unchanged.
 *
 * NOTE (runtime last-mile): Monaco and other browser-only panels must not touch
 * `window` during module init on the server. If SSR of a panel is a problem,
 * guard with `typeof window !== "undefined"` or render the route client-only.
 */
import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Loader = () => Promise<unknown>;
interface DynamicOptions {
  ssr?: boolean;
  loading?: (props?: { error?: Error | null; isLoading?: boolean; pastDelay?: boolean }) => ReactNode;
}

function normalize(mod: unknown): { default: ComponentType<any> } {
  const m = mod as any;
  const comp = (m && (m.default ?? m)) as ComponentType<any>;
  return { default: comp };
}

export default function dynamic(
  loader: Loader,
  options: DynamicOptions = {},
): ComponentType<any> {
  const Lazy = lazy(async () => normalize(await loader()));
  const Loading = options.loading;

  return function DynamicComponent(props: any) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
