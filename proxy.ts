import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  isAiMaintenanceMode,
  isCloudProvisioningDisabled,
  isProviderBackedApiPath,
} from "@/lib/operational-flags";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  if (isAiMaintenanceMode() && isProviderBackedApiPath(pathname)) {
    return NextResponse.json(
      { error: "AI is temporarily unavailable while maintenance is in progress." },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  if (isCloudProvisioningDisabled() && pathname === "/api/cloud/provision") {
    return NextResponse.json(
      { error: "Cloud provisioning is temporarily unavailable while maintenance is in progress." },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }

  const protectedPaths = ["/dashboard", "/editor", "/settings", "/billing", "/team", "/integrations"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // Public routes skip auth entirely — getUser() was adding ~10s per request when Supabase timed out.
  if (!isProtected && !isAuthPage) {
    return supabaseResponse;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
