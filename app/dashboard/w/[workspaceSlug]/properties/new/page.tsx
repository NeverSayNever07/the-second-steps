import { redirect } from "next/navigation";

// Creating a property is a modal on the list (ADR-038). This address is kept so
// existing links still work.
export default async function NewPropertyPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  redirect(`/dashboard/w/${workspaceSlug}/properties?new=1`);
}
