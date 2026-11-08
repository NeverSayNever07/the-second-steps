import { redirect } from "next/navigation";

// Creating a landlord lead is a modal on the list (ADR-038). This address is
// kept so existing links still work.
export default async function NewEnquiryPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/dashboard/w/${workspaceSlug}/enquiries?new=1`);
}
