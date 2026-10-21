import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecordPagesLab } from "@/components/design-lab/record-pages-lab";
import { requireMfaUser } from "@/core/auth/mfa";

export const metadata: Metadata = {
  title: "Record page options · Zayto",
  robots: { index: false, follow: false },
};

export default async function RecordPagesLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  await requireMfaUser("/design-lab/record-pages");

  return <RecordPagesLab />;
}
