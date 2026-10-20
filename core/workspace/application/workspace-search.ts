import "server-only";

import { listContacts } from "@/core/contacts/application/contacts";
import { listEnquiries } from "@/core/enquiries/application/enquiries";
import { ENQUIRY_STAGE_LABELS } from "@/core/enquiries/domain/enquiry-labels";
import { listInstructions } from "@/core/instructions/application/instruction-records";
import { JOURNEY_STAGE_LABELS } from "@/core/instructions/domain/instruction-labels";
import { listProperties } from "@/core/properties/application/properties";
import { SEARCH_TEXT_MAX } from "@/core/properties/domain/ids";

export const SEARCH_GROUP_SIZE = 5;
export const SEARCH_MIN_LENGTH = 2;

export type SearchGroupKind =
  "contacts" | "properties" | "leads" | "instructions";

export type SearchResultItem = {
  id: string;
  title: string;
  detail: string;
};

export type SearchGroup = {
  kind: SearchGroupKind;
  items: SearchResultItem[];
  /** True when more matches exist than are shown. */
  hasMore: boolean;
};

export type WorkspaceSearchResult = { groups: SearchGroup[] };

function group(kind: SearchGroupKind, items: SearchResultItem[]) {
  return {
    kind,
    items: items.slice(0, SEARCH_GROUP_SIZE),
    hasMore: items.length > SEARCH_GROUP_SIZE,
  } satisfies SearchGroup;
}

function contactTitle(contact: {
  kind: string;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}) {
  return contact.kind === "PERSON"
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : (contact.legalName ?? "Unnamed organisation");
}

/**
 * Small grouped results across contacts, properties, landlord leads and
 * instructions. Each group uses the same verified, branch-scoped read as its
 * worklist, so a group is empty for a role without permission and never
 * includes a record the viewer cannot open.
 */
export async function searchWorkspace(input: {
  authSubject: string;
  workspaceSlug: string;
  query: string;
}): Promise<WorkspaceSearchResult> {
  const query = input.query.trim().slice(0, SEARCH_TEXT_MAX);
  if (query.length < SEARCH_MIN_LENGTH) {
    return { groups: [] };
  }
  const base = {
    authSubject: input.authSubject,
    workspaceSlug: input.workspaceSlug,
  };
  const take = SEARCH_GROUP_SIZE + 1;
  const [contacts, properties, leads, instructions] = await Promise.all([
    listContacts({ ...base, query, limit: take }),
    listProperties({ ...base, query, take }),
    listEnquiries({ ...base, query, take }),
    listInstructions({ ...base, query, pageSize: take }),
  ]);

  return {
    groups: [
      group(
        "contacts",
        (contacts ?? []).map((contact) => ({
          id: contact.id,
          title: contactTitle(contact),
          detail: contact.reference,
        })),
      ),
      group(
        "properties",
        properties.map((property) => ({
          id: property.id,
          title: property.addressLine,
          detail: `${property.postcode} · ${property.reference}`,
        })),
      ),
      group(
        "leads",
        leads.map((lead) => ({
          id: lead.id,
          title: lead.enquirerName,
          detail: `${ENQUIRY_STAGE_LABELS[lead.stage]} · ${lead.reference}`,
        })),
      ),
      group(
        "instructions",
        instructions.items.map((instruction) => ({
          id: instruction.id,
          title: instruction.property.addressLine,
          detail: `${JOURNEY_STAGE_LABELS[instruction.journeyStage]} · ${instruction.reference}`,
        })),
      ),
    ].filter(({ items }) => items.length > 0),
  };
}
