import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { bookAppraisalAction } from "../../actions";
import { AppraisalBookingForm } from "@/components/enquiries/appraisal-booking-form";
import { Button } from "@/components/ui/button";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUser } from "@/core/auth/mfa";
import {
  getEnquiry,
  listEnquiryAssignees,
} from "@/core/enquiries/application/enquiries";
import { isUuid } from "@/core/properties/domain/ids";

export default async function BookAppraisalPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; enquiryId: string }>;
}) {
  const { workspaceSlug, enquiryId } = await params;
  if (!isUuid(enquiryId)) notFound();
  const recordPath = `/dashboard/w/${workspaceSlug}/enquiries/${enquiryId}`;
  const user = await requireMfaUser(`${recordPath}/book-appraisal`, {
    workspaceSlug,
  });
  const [enquiry, context, allAssignees] = await Promise.all([
    getEnquiry({ authSubject: user.id, workspaceSlug, enquiryId }),
    getWorkspaceAccessContext(user.id, workspaceSlug),
    listEnquiryAssignees({ authSubject: user.id, workspaceSlug }),
  ]);
  if (!context || !context.permissions.has("enquiry.update"))
    redirect("/access-denied");
  if (!enquiry) notFound();
  if (enquiry.stage !== "NEW_ENQUIRY") redirect(recordPath);
  const assignees = allAssignees.filter(
    ({ branchIds }) =>
      branchIds === null || branchIds.includes(enquiry.responsibleBranchId),
  );

  return (
    <div className="grid gap-8">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit"
        render={<Link href={recordPath} />}
        nativeButton={false}
      >
        <ArrowLeft aria-hidden="true" />
        Back to landlord lead
      </Button>
      <header>
        <p className="text-sm font-medium text-primary">{enquiry.reference}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Book an appraisal
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Review possible duplicate records before creating the landlord and
          property.
        </p>
      </header>
      <AppraisalBookingForm
        action={bookAppraisalAction.bind(null, workspaceSlug, enquiryId)}
        cancelHref={recordPath}
        enquiry={{
          name: enquiry.enquirerName,
          email: enquiry.enquirerEmail,
          telephone: enquiry.enquirerTelephone,
          addressBuilding: enquiry.addressBuilding,
          addressStreet: enquiry.addressStreet,
          postcode: enquiry.postcode ?? "",
        }}
        assignees={assignees}
        linked={
          enquiry.contactId && enquiry.propertyId
            ? {
                landlord: enquiry.enquirerName,
                property: [
                  enquiry.addressBuilding,
                  enquiry.addressStreet,
                  enquiry.postcode,
                ]
                  .filter(Boolean)
                  .join(", "),
              }
            : null
        }
      />
    </div>
  );
}
