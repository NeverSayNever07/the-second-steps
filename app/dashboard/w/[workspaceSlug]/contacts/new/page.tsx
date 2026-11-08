import { redirect } from "next/navigation";

// Creating a contact is a modal on the list (ADR-038). This address is kept so
// existing links still work.
export default async function NewContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const { workspaceSlug } = await params;
  const { kind } = await searchParams;
  redirect(
    `/dashboard/w/${workspaceSlug}/contacts?new=${kind === "organisation" ? "organisation" : "person"}`,
  );
}
