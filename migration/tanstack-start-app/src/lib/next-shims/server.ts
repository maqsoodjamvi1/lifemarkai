/**
 * next/server shim for Vite / TanStack Start — enough for existing app/api handlers.
 */
import { getRequestAls } from "../request-als";

export class NextRequest extends Request {
  nextUrl: URL;
  cookies: {
    get: (name: string) => { name: string; value: string } | undefined;
    getAll: () => Array<{ name: string; value: string }>;
    set: (name: string, value: string) => void;
    delete: (name: string) => void;
    has: (name: string) => boolean;
  };

  constructor(input: RequestInfo | URL, init?: RequestInit) {
    // Clone via URL string so we can safely re-read the body later if needed.
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    super(url, init ?? (input instanceof Request ? input : undefined));
    this.nextUrl = new URL(url);
    const jar = () => getRequestAls()?.cookies ?? new Map<string, string>();
    this.cookies = {
      get(name: string) {
        const v = jar().get(name);
        return v === undefined ? undefined : { name, value: v };
      },
      getAll() {
        return [...jar().entries()].map(([name, value]) => ({ name, value }));
      },
      set(name: string, value: string) {
        jar().set(name, value);
        const als = getRequestAls();
        als?.pendingSetCookies.push({ name, value });
      },
      delete(name: string) {
        jar().delete(name);
        const als = getRequestAls();
        als?.pendingSetCookies.push({
          name,
          value: "",
          options: { maxAge: 0, path: "/" },
        });
      },
      has(name: string) {
        return jar().has(name);
      },
    };
  }
}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json; charset=utf-8");
    }
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }

  static redirect(url: string | URL, status = 307) {
    return new NextResponse(null, {
      status,
      headers: { Location: String(url) },
    });
  }

  static next() {
    return new NextResponse(null, { status: 200 });
  }
}

export function headers() {
  const als = getRequestAls();
  return new Headers(als?.request.headers);
}

export function cookies() {
  const als = getRequestAls();
  const jar = als?.cookies ?? new Map<string, string>();
  return {
    get(name: string) {
      const v = jar.get(name);
      return v === undefined ? undefined : { name, value: v };
    },
    getAll() {
      return [...jar.entries()].map(([name, value]) => ({ name, value }));
    },
    set(name: string, value: string, options?: Record<string, unknown>) {
      jar.set(name, value);
      als?.pendingSetCookies.push({ name, value, options });
    },
    delete(name: string, options?: Record<string, unknown>) {
      jar.delete(name);
      als?.pendingSetCookies.push({
        name,
        value: "",
        options: { path: "/", ...options, maxAge: 0 },
      });
    },
    has(name: string) {
      return jar.has(name);
    },
  };
}

/** Build a NextRequest from a Fetch Request (preserves body stream). */
export function toNextRequest(request: Request): NextRequest {
  return new NextRequest(request.url, request);
}
