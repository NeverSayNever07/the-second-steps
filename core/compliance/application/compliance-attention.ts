import "server-only";

import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { hasPermission } from "@/core/access/domain/role";
import { resolveContactActor } from "@/core/contacts/application/contact-actor";
import type { EnquiryActorInput } from "@/core/enquiries/application/enquiry-shared";
import { ukToday } from "@/core/enquiries/domain/enquiry";
import { addressLine } from "@/core/properties/application/properties";
import {
  classifyAttention,
  daysUntil,
  isComplianceArea,
  isEvidenceStatus,
  type AttentionKind,
  type ComplianceAreaCode,
} from "../domain/compliance";

// Where compliance needs attention across the properties a person can see.
// Only dated evidence and staff-recorded outcomes count: an area is listed
// when the evidence relied on has an entered date that is expired or inside
// the 60, 30 or 7 day windows, or when a review said action is required.
// Zayto draws attention; it does not decide what the law requires.

/** How many properties and areas the panel lists; the counts cover them all. */
const LIST_LIMIT = 10;
/** Rows read before counting stops being exact; far above realistic volumes. */
const ROW_CAP = 2000;

/** Most urgent first. */
const URGENCY: readonly AttentionKind[] = [
  "critical",
  "expired",
  "action_required",
  "within_7",
  "within_30",
  "within_60",
];

export type ComplianceAttentionItem = {
  propertyId: string;
  property: string;
  area: ComplianceAreaCode;
  kind: AttentionKind;
  /** The date entered from the evidence relied on, "YYYY-MM-DD", if any. */
  expiresOn: string | null;
  /** Negative once the date has passed. */
  days: number | null;
};

export type ComplianceAttention = {
  counts: {
    critical: number;
    expired: number;
    actionRequired: number;
    /** Dates inside the next 60 days (7, 30 and 60 day windows together). */
    dueSoon: number;
  };
  /** Total areas needing attention, including ones not listed. */
  total: number;
  items: ComplianceAttentionItem[];
};

type Row = {
  property_id: string;
  area: string;
  status: string | null;
  expires_on: Date | null;
};

const day = (value: Date) => value.toISOString().slice(0, 10);

/**
 * Null when the viewer may not read properties. Limited to properties the
 * viewer's branch access lets them see (row-level security), and only to
 * active properties where the area currently applies.
 */
export async function getComplianceAttention(
  input: EnquiryActorInput & { now?: Date },
): Promise<ComplianceAttention | null> {
  const today = ukToday(input.now ?? new Date());
  return withVerifiedIdentity(
    input.authSubject,
    async (transaction, identity) => {
      const actor = await resolveContactActor(transaction, {
        userIdentityId: identity.userIdentityId,
        workspaceSlug: input.workspaceSlug,
      });
      if (!actor || !hasPermission(actor.roles, "property.read")) return null;

      // The newest applicability, status and relied-on evidence for each
      // area. Only areas that apply and have something to flag are returned.
      const rows = await transaction.$queryRaw<Row[]>`
        SELECT i."property_id", i."area"::text AS "area", s."status"::text AS "status",
          e."expires_on"
        FROM "property_compliance_items" AS i
        JOIN "properties" AS p
          ON p."workspace_id" = i."workspace_id"
          AND p."id" = i."property_id"
          AND p."status" = 'active'
        JOIN LATERAL (
          SELECT a."applicability"
          FROM "property_compliance_assessments" AS a
          WHERE a."workspace_id" = i."workspace_id" AND a."item_id" = i."id"
          ORDER BY a."recorded_at" DESC, a."id" DESC
          LIMIT 1
        ) AS latest ON latest."applicability" = 'applies'
        LEFT JOIN LATERAL (
          SELECT s2."status", s2."evidence_id"
          FROM "property_compliance_status_events" AS s2
          WHERE s2."workspace_id" = i."workspace_id" AND s2."item_id" = i."id"
          ORDER BY s2."recorded_at" DESC, s2."id" DESC
          LIMIT 1
        ) AS s ON true
        LEFT JOIN "property_compliance_evidence" AS e
          ON e."workspace_id" = i."workspace_id" AND e."id" = s."evidence_id"
        WHERE i."workspace_id" = ${actor.workspaceId}::uuid
          AND (
            s."status" = 'action_required'
            OR e."expires_on" <= ${today}::date + 60
          )
        ORDER BY e."expires_on" NULLS LAST, i."id"
        LIMIT ${ROW_CAP}
      `;

      const flagged = rows.flatMap((row) => {
        if (!isComplianceArea(row.area)) return [];
        const expiresOn = row.expires_on ? day(row.expires_on) : null;
        const kind = classifyAttention({
          area: row.area,
          status:
            row.status && isEvidenceStatus(row.status) ? row.status : null,
          expiresOn,
          today,
        });
        return kind
          ? [
              {
                propertyId: row.property_id,
                area: row.area,
                kind,
                expiresOn,
                days: expiresOn ? daysUntil(expiresOn, today) : null,
              },
            ]
          : [];
      });

      flagged.sort(
        (a, b) =>
          URGENCY.indexOf(a.kind) - URGENCY.indexOf(b.kind) ||
          (a.days ?? Number.MAX_SAFE_INTEGER) -
            (b.days ?? Number.MAX_SAFE_INTEGER),
      );

      const shown = flagged.slice(0, LIST_LIMIT);
      const properties = shown.length
        ? await transaction.property.findMany({
            where: {
              workspaceId: actor.workspaceId,
              id: { in: [...new Set(shown.map((item) => item.propertyId))] },
            },
            select: {
              id: true,
              addressBuilding: true,
              addressStreet: true,
              townCity: true,
            },
          })
        : [];
      const names = new Map(
        properties.map((property) => [property.id, addressLine(property)]),
      );

      const count = (...kinds: AttentionKind[]) =>
        flagged.filter((item) => kinds.includes(item.kind)).length;
      return {
        counts: {
          critical: count("critical"),
          expired: count("critical", "expired"),
          actionRequired: count("action_required"),
          dueSoon: count("within_7", "within_30", "within_60"),
        },
        total: flagged.length,
        items: shown.map((item): ComplianceAttentionItem => ({
          ...item,
          property: names.get(item.propertyId) ?? "Property",
        })),
      };
    },
  );
}
