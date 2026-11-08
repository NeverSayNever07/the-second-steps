import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  LookAndFeelLab,
  SCREENS,
  type ScreenId,
} from "@/components/design-lab/look-and-feel-lab";
import { requireMfaUser } from "@/core/auth/mfa";

export const metadata: Metadata = {
  title: "Look and feel options · Zayto",
  robots: { index: false, follow: false },
};

export default async function LookAndFeelLabPage({
  searchParams,
}: {
  searchParams: Promise<{
    d?: string | string[];
    s?: string | string[];
    compare?: string | string[];
  }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  await requireMfaUser("/design-lab/look-and-feel");
  const search = await searchParams;
  const direction = typeof search.d === "string" ? search.d : "d1";
  const screen = SCREENS.find((item) => item.id === search.s)?.id ?? "list";

  return (
    <LookAndFeelLab
      directionId={direction}
      screen={screen as ScreenId}
      compare={search.compare === "1"}
    />
  );
}
