import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnvironment } from "./env";
import { sessionCookieOptions } from "./session-cookies";

export async function updateSupabaseSession(
  request: NextRequest,
  forwardedHeaders = new Headers(request.headers),
) {
  const createResponse = () => {
    const headers = new Headers(forwardedHeaders);
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) headers.set("cookie", cookieHeader);
    return NextResponse.next({ request: { headers } });
  };

  let response = createResponse();
  const { publishableKey, url } = getSupabasePublicEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: sessionCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = createResponse();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}
