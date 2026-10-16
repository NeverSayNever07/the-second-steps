"use server";

import { redirect } from "next/navigation";
import { safePostMfaPath } from "@/core/auth/mfa-path";
import { createSupabaseServerClient } from "@/core/auth/supabase-server";

export type MfaPreparation =
  | { kind: "already-verified" }
  | { kind: "challenge" }
  | { kind: "enrol"; qrCode: string; secret: string }
  | { kind: "unavailable" };

export type MfaVerificationFailure = { ok: false; message: string };

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

const SIX_DIGIT_CODE = /^\d{6}$/;

async function signedInClient(): Promise<SupabaseServerClient> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return supabase;
}

export async function prepareMfa(): Promise<MfaPreparation> {
  const supabase = await signedInClient();

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return { kind: "unavailable" };

  if (assurance.currentLevel === "aal2") {
    return { kind: "already-verified" };
  }

  const { data: factors, error: factorsError } =
    await supabase.auth.mfa.listFactors();
  if (factorsError) return { kind: "unavailable" };

  const isVerified = factors.totp.some(
    (factor) => factor.status === "verified",
  );
  if (isVerified) {
    return { kind: "challenge" };
  }

  // An abandoned set-up leaves an unverified factor behind; start afresh so
  // the QR code on screen is always the one being checked.
  const unverifiedFactors = factors.all.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  );
  for (const factor of unverifiedFactors) {
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: factor.id,
    });
    if (error) return { kind: "unavailable" };
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Zayto authenticator",
    issuer: "Zayto",
  });
  if (error) return { kind: "unavailable" };

  return { kind: "enrol", qrCode: data.totp.qr_code, secret: data.totp.secret };
}

// The factor is looked up on the server, never taken from the browser, so a
// caller can only ever verify against their own authenticator.
async function currentTotpFactorId(
  supabase: SupabaseServerClient,
): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;

  const verified = data.totp.find((factor) => factor.status === "verified");
  if (verified) {
    return verified.id;
  }

  const pending = data.all.find(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  );
  return pending?.id ?? null;
}

export async function verifyMfa(
  nextPath: unknown,
  code: unknown,
): Promise<MfaVerificationFailure> {
  const isSixDigitCode = typeof code === "string" && SIX_DIGIT_CODE.test(code);
  if (!isSixDigitCode) {
    return {
      ok: false,
      message: "Enter the six-digit code from your authenticator app.",
    };
  }

  const supabase = await signedInClient();
  const factorId = await currentTotpFactorId(supabase);
  if (!factorId) {
    return {
      ok: false,
      message:
        "Two-step verification could not be prepared. Refresh the page and try again.",
    };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code,
  });
  if (error) {
    return {
      ok: false,
      message: "That code was not accepted. Check the code and try again.",
    };
  }

  const requestedPath = typeof nextPath === "string" ? nextPath : undefined;
  redirect(safePostMfaPath(requestedPath));
}
