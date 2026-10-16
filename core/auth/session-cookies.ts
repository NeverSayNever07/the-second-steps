import type { CookieOptionsWithName } from "@supabase/ssr";

// Session tokens are for the server only. HttpOnly stops a script injected
// into a page from reading them and taking over the session, so all Supabase
// auth calls run on the server (Server Actions, Route Handlers, proxy.ts).
// Local development runs over plain HTTP, so Secure is production-only.
export function sessionCookieOptions(): CookieOptionsWithName {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}
