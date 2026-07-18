/** Join a sandbox preview base URL with an in-app route (Lovable URL bar parity). */
export function sandboxUrlWithPath(baseUrl: string, pathname: string): string {
  try {
    const u = new URL(baseUrl);
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    u.pathname = path;
    return u.toString();
  } catch {
    return baseUrl;
  }
}
