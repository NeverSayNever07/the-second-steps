import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IDEAS, NextIdeasLab } from "@/components/design-lab/next-ideas-lab";
import { requireMfaUser } from "@/core/auth/mfa";

export const metadata: Metadata = {
  title: "Design ideas, November 2026 · Zayto",
  robots: { index: false, follow: false },
};

export default async function NextIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  await requireMfaUser("/design-lab/next-ideas");
  const search = await searchParams;
  const idea = IDEAS.find((item) => item.id === search.v)?.id ?? "journey";

  return <NextIdeasLab idea={idea} />;
}
