/**
 * Lazy-component helper for TanStack Start / Vite.
 *
 * WHAT THIS IS: a thin wrapper over React.lazy + Suspense that keeps the
 * `dynamic(factory, { ssr, loading })` call shape used by ~40 editor panels.
 *
 * WHAT THIS IS NOT: a Next.js dependency. It was previously named
 * `next-dynamic.tsx` because it replaced `next/dynamic` during the migration,
 * but nothing here imports or requires Next — it is plain React. The old name
 * kept the word "next" in the runtime path and made "is Next fully gone?" greps
 * return false positives, which is the only reason it was renamed.
 *
 * Deliberately NOT rewritten into bare React.lazy at each call site: that would
 * mean hand-wrapping ~40 panels in <Suspense> with no functional gain and real
 * regression risk. Keeping one adapter is the cheaper, safer design.
 *
 *   - `ssr: false`   → naturally satisfied (lazy renders client-side under Suspense)
 *   - `loading`      → becomes the Suspense fallback
 *   - factory return → normalized: accepts a Component, `{ default }`, or a
 *     module whose default is the component (covers both `import(x)` and
 *     `import(x).then(m => m.Named)` factories used in the editor).
 *
 * NOTE (runtime last-mile): Monaco and other browser-only panels must not touch
 * `window` during module init on the server. If SSR of a panel is a problem,
 * guard with `typeof window !== "undefined"` or render the route client-only
 * (the editor route uses `ssr: "data-only"` for exactly this reason).
 */
import { createElement,lazy,Suspense,type ComponentType,type ReactNode } from "react";

interface DynamicOptions {
  ssr?: boolean;
  loading?: (props?: { error?: Error | null; isLoading?: boolean; pastDelay?: boolean }) => ReactNode;
}

type LoadedComponent<T> = T extends { default: infer C } ? C : T;
type ComponentPropsFromModule<T> = (
  LoadedComponent<T> extends ComponentType<infer P>
    ? unknown extends P
      ? Record<never, never>
      : P
    : never
) & object;

function normalize<T>(mod: T): { default: ComponentType<ComponentPropsFromModule<T>> } {
  const moduleWithDefault = mod as { default?: unknown };
  const comp = (moduleWithDefault?.default ?? mod) as ComponentType<ComponentPropsFromModule<T>>;
  return { default: comp };
}

export default function dynamic<T>(
  loader: () => Promise<T>,
  options: DynamicOptions = {},
): ComponentType<ComponentPropsFromModule<T>> {
  const Lazy = lazy(async (): Promise<{ default: ComponentType<ComponentPropsFromModule<T>> }> =>
    normalize<T>(await loader())
  );
  const Loading = options.loading;

  return function DynamicComponent(props: ComponentPropsFromModule<T>) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        {createElement(Lazy as unknown as ComponentType<ComponentPropsFromModule<T>>, props)}
      </Suspense>
    );
  };
}
