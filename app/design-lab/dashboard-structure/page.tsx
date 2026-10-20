import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StructureLab } from "@/components/design-lab/dashboards/structure-lab";
import { requireMfaUser } from "@/core/auth/mfa";

export const metadata: Metadata = {
  title: "Dashboard structure · Zayto",
  robots: { index: false, follow: false },
};

export default async function DashboardStructureLabPage() {
  if (process.env.NODE_ENV === "production") notFound();

  await requireMfaUser("/design-lab/dashboard-structure");

  return <StructureLab />;
}
