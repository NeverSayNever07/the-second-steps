"use server";

import {
  getSandboxAuthEmails,
  isSandboxEnvironment,
  normaliseEmail,
} from "@/core/auth/config";
import {
  getSandboxPersona,
  isSandboxQuickSignInEnabled,
} from "@/core/auth/config";
import { provisionSandboxAccess } from "@/core/access/data/sandbox-provisioning";
import { getAppUrl } from "@/core/auth/env";
import { createSupabaseAdminClient } from "@/core/auth/supabase-admin";
import { createSupabaseServerClient } from "@/core/auth/supabase-server";
import { sendSandboxMagicLink } from "@/core/email/mailpit";
import { redirect } from "next/navigation";
import type { LoginState } from "./login-state";

const GENERIC_MESSAGE =
  "If this email has been invited, a sign-in link is now in the local mail sandbox.";

export async function requestMagicLink(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normaliseEmail(formData.get("email"));
  if (!email) {
    return { status: "error", message: "Enter a valid email address." };
  }

  if (!isSandboxEnvironment()) {
    return {
      status: "error",
      message: "Production email delivery has not been configured yet.",
    };
  }

  if (!getSandboxAuthEmails().has(email)) {
    return { status: "sent", message: GENERIC_MESSAGE };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) throw error;

    const signInUrl = new URL("/auth/confirm", getAppUrl());
    signInUrl.searchParams.set("token_hash", data.properties.hashed_token);

    await sendSandboxMagicLink(email, signInUrl.toString());
    return { status: "sent", message: GENERIC_MESSAGE };
  } catch {
    return {
      status: "error",
      message:
        "The local sign-in email could not be created. Check that Mailpit is running and try again.",
    };
  }
}

export async function quickSignIn(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!isSandboxQuickSignInEnabled()) {
    return {
      status: "error",
      message: "Quick sign-in is not available in this environment.",
    };
  }

  const email = normaliseEmail(formData.get("email"));
  if (
    !email ||
    !getSandboxPersona(email) ||
    !getSandboxAuthEmails().has(email)
  ) {
    return { status: "error", message: "Choose an approved sandbox user." };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
    if (linkError) throw linkError;

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "email",
    });
    if (error || !data.user?.email) throw error ?? new Error("No auth user.");

    try {
      await provisionSandboxAccess({
        authSubject: data.user.id,
        email: data.user.email,
      });
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }
  } catch {
    return {
      status: "error",
      message: "The sandbox session could not be created. Try again.",
    };
  }

  redirect("/dashboard");
}
