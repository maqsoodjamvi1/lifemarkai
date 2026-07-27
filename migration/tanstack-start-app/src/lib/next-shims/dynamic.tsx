import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

type DynamicOptions = {
  ssr?: boolean;
  loading?: () => ReactNode;
};

type Loader<T> = () => Promise<T | { default: T }>;

/**
 * Minimal `next/dynamic` replacement using React.lazy + Suspense.
 * Honors `{ ssr: false }` so browser-only modules never run during SSR.
 */
export default function dynamic<P extends object>(
  loader: Loader<ComponentType<P>>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await loader();
    if (mod && typeof mod === "object" && "default" in mod) {
      return mod as { default: ComponentType<P> };
    }
    return { default: mod as ComponentType<P> };
  });
  // React.lazy's props inference fights with generic P — the runtime shape is fine.
  const LazyComp = Lazy as unknown as ComponentType<P>;

  function DynamicComponent(props: P) {
    const [clientReady, setClientReady] = useState(options.ssr !== false);

    useEffect(() => {
      if (options.ssr === false) setClientReady(true);
    }, []);

    if (!clientReady) {
      return options.loading ? <>{options.loading()}</> : null;
    }

    return (
      <Suspense fallback={options.loading ? <>{options.loading()}</> : null}>
        <LazyComp {...props} />
      </Suspense>
    );
  }

  DynamicComponent.displayName = "NextDynamicShim";
  return DynamicComponent;
}
