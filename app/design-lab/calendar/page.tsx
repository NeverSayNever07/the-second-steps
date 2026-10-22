import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarLab } from "@/components/design-lab/calendar-lab";
import { requireMfaUser } from "@/core/auth/mfa";

export const metadata: Metadata = {
  title: "Calendar design · Zayto",
  robots: { index: false, follow: false },
};

export default async function CalendarDesignLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  await requireMfaUser("/design-lab/calendar");

  return <CalendarLab />;
}
