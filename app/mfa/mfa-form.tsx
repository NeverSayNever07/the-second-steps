"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prepareMfa, verifyMfa, type MfaPreparation } from "./actions";

type Enrolment = {
  qrCode: string;
  secret: string;
};

export function MfaForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const preparationRef = useRef<Promise<MfaPreparation> | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "loading" | "ready" | "submitting" | "error"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    if (!preparationRef.current) {
      preparationRef.current = prepareMfa();
    }

    preparationRef.current
      .then((preparation) => {
        if (!active) return;

        if (preparation.kind === "already-verified") {
          router.replace(nextPath);
          router.refresh();
          return;
        }

        if (preparation.kind === "unavailable") {
          throw new Error("Two-step verification is unavailable.");
        }

        if (preparation.kind === "enrol") {
          setEnrolment({
            qrCode: preparation.qrCode,
            secret: preparation.secret,
          });
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setMessage(
          "Two-step verification could not be prepared. Refresh the page and try again.",
        );
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [nextPath, router]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    // On success the server upgrades the session cookie and redirects.
    const failure = await verifyMfa(nextPath, code);
    setMessage(failure.message);
    setStatus("ready");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {enrolment ? "Set up your authenticator" : "Enter your code"}
        </CardTitle>
        <CardDescription>
          {enrolment
            ? "Scan this QR code with your authenticator app, then enter the six-digit code it shows."
            : "Open your authenticator app and enter the current six-digit code."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {status === "loading" && (
          <p className="text-sm text-muted-foreground">
            Preparing secure verification…
          </p>
        )}

        {enrolment && (
          <div className="grid justify-items-center gap-3 rounded-lg bg-white p-4 text-black">
            <Image
              unoptimized
              src={enrolment.qrCode.trimEnd()}
              alt="Authenticator setup QR code"
              width={200}
              height={200}
            />
            <details className="w-full text-xs">
              <summary className="cursor-pointer font-medium">
                Cannot scan the code?
              </summary>
              <p data-testid="totp-secret" className="mt-2 break-all font-mono">
                {enrolment.secret}
              </p>
            </details>
          </div>
        )}

        {status !== "loading" && (
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Six-digit code</Label>
              <Input
                id="mfa-code"
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                disabled={status === "submitting" || status === "error"}
                required
              />
            </div>
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={status === "submitting" || status === "error"}
            >
              {status === "submitting" ? "Checking…" : "Continue securely"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
