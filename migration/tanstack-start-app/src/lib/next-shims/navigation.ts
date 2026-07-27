/**
 * Shim for `next/navigation` when mounting the main-repo EditorLayout
 * inside TanStack Start.
 */
import {
  useNavigate,
  useParams as useTanstackParams,
  useRouterState,
  useSearch,
  redirect as tanstackRedirect,
} from "@tanstack/react-router";

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => void navigate({ to: href }),
    replace: (href: string) => void navigate({ to: href, replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: async () => {},
  };
}

export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}

export function useSearchParams(): URLSearchParams {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  // Loose call — Next's useParams has no route-scoped typing to mirror.
  const loose = useTanstackParams as (opts: { strict: false }) => Record<string, string>;
  return loose({ strict: false }) as T;
}

export function redirect(url: string): never {
  throw tanstackRedirect({ to: url });
}

export function notFound(): never {
  throw new Error("NEXT_NOT_FOUND");
}

export { useSearch };
