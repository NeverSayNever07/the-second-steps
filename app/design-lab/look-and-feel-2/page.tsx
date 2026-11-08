import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  FACT_VARIANTS,
  LookAndFeelRoundTwo,
  VIEWS,
} from "@/components/design-lab/look-and-feel-round-two";
import { requireMfaUser } from "@/core/auth/mfa";

export const metadata: Metadata = {
  title: "Look and feel, round two · Zayto",
  robots: { index: false, follow: false },
};

export default async function LookAndFeelRoundTwoPage({
  searchParams,
}: {
  searchParams: Promise<{
    v?: string | string[];
    f?: string | string[];
    b?: string | string[];
  }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  await requireMfaUser("/design-lab/look-and-feel-2");
  const search = await searchParams;
  const view = VIEWS.find((item) => item.id === search.v)?.id ?? "list";
  const facts = FACT_VARIANTS.find((item) => item.id === search.f)?.id ?? "a";
  const band = search.b === "navy" ? "navy" : "blue";

  return <LookAndFeelRoundTwo view={view} facts={facts} band={band} />;
}
