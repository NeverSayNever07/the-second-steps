import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { evaluateFeatureFlagForIdentity } from "@/core/feature-flags/application/evaluate-feature-flag";
import { safePostMfaPath } from "./mfa-path";
import { createSupabaseServerClient } from "./supabase-server";

// A layout and its page both call requireMfaUser. React scopes these caches
// to a single server request, so each request asks Supabase once and the
// answer is never shared between requests or users.
const getSignedInSession = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const isSecondStepVerified =
    !assuranceError && assurance.currentLevel === "aal2";

  return { user: userData.user, isSecondStepVerified };
});

const isStaffMfaRequired = cache(
  async (authSubject: string, workspaceSlug: string | undefined) => {
    const mfaFlag = await evaluateFeatureFlagForIdentity({
      authSubject,
      key: "staff_mfa",
      workspaceSlug,
    });
    return mfaFlag.enabled;
  },
);

type SignedInSession = NonNullable<
  Awaited<ReturnType<typeof getSignedInSession>>
>;

async function requireSecondStep(
  session: SignedInSession,
  nextPath: string,
  workspaceSlug: string | undefined,
) {
  const isMfaRequired = await isStaffMfaRequired(
    session.user.id,
    workspaceSlug,
  );
  if (isMfaRequired && !session.isSecondStepVerified) {
    const next = safePostMfaPath(nextPath);
    redirect(`/mfa?next=${encodeURIComponent(next)}`);
  }
}

export async function requireMfaUser(
  nextPath: string,
  options: { workspaceSlug?: string } = {},
) {
  const session = await getSignedInSession();
  if (!session) redirect("/login");

  await requireSecondStep(session, nextPath, options.workspaceSlug);
  return session.user;
}

// Runs the second-step check and the page's reads at the same time instead of
// one after the other. The check settles first: a session that still needs
// its second step is redirected even if a read failed, and the caller gets
// the data only once the check has passed. Only pass reads, never writes.
export async function requireMfaUserWith<T>(
  nextPath: string,
  options: { workspaceSlug?: string },
  read: (user: SignedInSession["user"]) => Promise<T>,
): Promise<{ user: SignedInSession["user"]; data: T }> {
  const session = await getSignedInSession();
  if (!session) redirect("/login");

  const reading = read(session.user);
  reading.catch(() => {
    // Surfaced below, once the second-step check has passed.
  });

  await requireSecondStep(session, nextPath, options.workspaceSlug);
  return { user: session.user, data: await reading };
}
