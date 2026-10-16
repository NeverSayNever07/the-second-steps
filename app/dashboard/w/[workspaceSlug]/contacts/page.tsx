import { ContactRound, Plus, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionSelect } from "@/components/ui/option-select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getWorkspaceAccessContext } from "@/core/access/application/access-context";
import { requireMfaUserWith } from "@/core/auth/mfa";
import { listContacts } from "@/core/contacts/application/contacts";

function value(value: string | null | undefined) {
  return value || "Not recorded";
}
function label(contact: {
  kind: string;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}) {
  return contact.kind === "PERSON"
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : value(contact.legalName);
}
function firstValue(contact: {
  contactPoints: readonly { value: string; isPreferred: boolean }[];
}) {
  return (
    contact.contactPoints.find(({ isPreferred }) => isPreferred)?.value ??
    contact.contactPoints[0]?.value ??
    "Not recorded"
  );
}

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    q?: string | string[];
    kind?: string | string[];
    archived?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const path = `/dashboard/w/${workspaceSlug}/contacts`;
  const search = await searchParams;
  const query = typeof search.q === "string" ? search.q : "";
  const kind =
    search.kind === "person" || search.kind === "organisation"
      ? search.kind
      : undefined;
  const includeArchived = search.archived === "yes";
  const {
    data: [contacts, context],
  } = await requireMfaUserWith(path, { workspaceSlug }, (user) =>
    Promise.all([
      listContacts({
        authSubject: user.id,
        workspaceSlug,
        query,
        kind,
        includeArchived,
      }),
      getWorkspaceAccessContext(user.id, workspaceSlug),
    ]),
  );
  if (!contacts || !context) redirect("/access-denied");
  const canCreate = context.permissions.has("contact.create");

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Shared people and organisations. A contact becomes a landlord when
            linked to a landlord lead, property or instruction.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`${path}/new`} />} nativeButton={false}>
            <Plus aria-hidden="true" />
            New contact
          </Button>
        )}
      </div>
      <div>
        <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="q">
              Search contacts
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9"
                id="q"
                name="q"
                defaultValue={query}
                placeholder="Name, reference, email or telephone"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="kind">
              Type
            </label>
            <OptionSelect
              className="w-44"
              id="kind"
              name="kind"
              placeholder="All contacts"
              defaultValue={kind ?? ""}
              options={[
                { value: "", label: "All contacts" },
                { value: "person", label: "People" },
                { value: "organisation", label: "Organisations" },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 text-sm md:h-9">
            <input
              type="checkbox"
              name="archived"
              value="yes"
              defaultChecked={includeArchived}
            />
            Include archived
          </label>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      </div>
      {contacts.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 py-12 text-center">
            <ContactRound
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">No contacts found</p>
              <p className="text-sm text-muted-foreground">
                Try changing the search or add the first contact.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid divide-y overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10 md:hidden">
            {contacts.map((contact) => (
              <Link
                key={contact.id}
                href={`${path}/${contact.id}`}
                className="p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{label(contact)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {firstValue(contact)}
                    </p>
                  </div>
                  {contact.status === "ARCHIVED" ? (
                    <StatusBadge label="Archived" tone="inactive" />
                  ) : (
                    <Badge variant="secondary">
                      {contact.kind === "PERSON" ? "Person" : "Organisation"}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {contact.branchLinks[0]?.branch.name ?? "No branch"} ·{" "}
                  {contact.reference}
                </p>
              </Link>
            ))}
          </div>
          <Card className="hidden py-0 md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Preferred contact</TableHead>
                    <TableHead>Primary branch</TableHead>
                    <TableHead>Last updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow
                      key={contact.id}
                      className="group relative cursor-pointer hover:bg-muted"
                    >
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary group-hover:underline after:absolute after:inset-0"
                          href={`${path}/${contact.id}`}
                        >
                          {label(contact)}
                        </Link>
                        <p className="text-xs font-normal text-muted-foreground">
                          {contact.reference}
                        </p>
                      </TableCell>
                      <TableCell>
                        {contact.status === "ARCHIVED" ? (
                          <StatusBadge label="Archived" tone="inactive" />
                        ) : (
                          <Badge
                            variant="secondary"
                            className="group-hover:bg-card"
                          >
                            {contact.kind === "PERSON"
                              ? "Person"
                              : "Organisation"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{firstValue(contact)}</TableCell>
                      <TableCell>
                        {contact.branchLinks[0]?.branch.name ?? "Not recorded"}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("en-GB").format(
                          contact.updatedAt,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
