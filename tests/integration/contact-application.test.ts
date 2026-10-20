import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  archiveContact,
  createContact,
  findDuplicateContacts,
  getContact,
  listContactPage,
  listContacts,
  reactivateContact,
  updateContact,
  updateOrganisationIdentity,
} from "@/core/contacts/application/contacts";
import {
  addContactNote,
  editContactNote,
  listContactNotes,
  voidContactNote,
} from "@/core/contacts/application/contact-notes";
import {
  createAndLinkOrganisationPerson,
  endOrganisationPersonLink,
  linkOrganisationPerson,
  updateOrganisationPersonLink,
} from "@/core/contacts/application/organisation-people";
import { withVerifiedIdentity } from "@/core/access/data/database-context";
import { db } from "@/core/db/client";

const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!runtimeUrl || !adminUrl) {
  throw new Error("Integration tests require isolated database URLs.");
}
for (const value of [runtimeUrl, adminUrl]) {
  const url = new URL(value);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/zayto_test") {
    throw new Error("Refusing to run integration tests outside zayto_test.");
  }
}

const adminPool = new Pool({ connectionString: adminUrl, ssl: false });
const ids = {
  workspace: randomUUID(),
  ownerIdentity: randomUUID(),
  ownerMembership: randomUUID(),
  ownerAuth: randomUUID(),
  branchA: randomUUID(),
  branchB: randomUUID(),
  managerIdentity: randomUUID(),
  managerAuth: randomUUID(),
  managerMembership: randomUUID(),
  negotiatorAIdentity: randomUUID(),
  negotiatorAAuth: randomUUID(),
  negotiatorAMembership: randomUUID(),
  negotiatorBIdentity: randomUUID(),
  negotiatorBAuth: randomUUID(),
  negotiatorBMembership: randomUUID(),
};

async function addUser(
  client: PoolClient,
  input: {
    identityId: string;
    authSubject: string;
    membershipId: string;
    role: "branch_manager" | "negotiator";
    branchId: string;
  },
) {
  await client.query(
    `INSERT INTO "user_identities" ("id", "updated_at")
     VALUES ($1::uuid, CURRENT_TIMESTAMP)`,
    [input.identityId],
  );
  await client.query(
    `INSERT INTO "authentication_provider_links"
      ("user_identity_id", "provider", "provider_subject")
     VALUES ($1::uuid, 'supabase', $2::uuid)`,
    [input.identityId, input.authSubject],
  );
  await client.query(
    `INSERT INTO "memberships"
      ("id", "workspace_id", "user_identity_id", "scope_mode", "updated_at")
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'named_branches', CURRENT_TIMESTAMP)`,
    [input.membershipId, ids.workspace, input.identityId],
  );
  await client.query(
    `INSERT INTO "membership_roles"
      ("workspace_id", "membership_id", "role_code")
     VALUES ($1::uuid, $2::uuid, $3::membership_role_code)`,
    [ids.workspace, input.membershipId, input.role],
  );
  await client.query(
    `INSERT INTO "membership_branch_access"
      ("workspace_id", "membership_id", "branch_id")
     VALUES ($1::uuid, $2::uuid, $3::uuid)`,
    [ids.workspace, input.membershipId, input.branchId],
  );
}

async function seed() {
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `TRUNCATE TABLE "audit_events", "workspace_feature_flag_overrides",
        "membership_branch_access", "membership_roles", "memberships",
        "branches", "platform_role_assignments",
        "authentication_provider_links", "workspaces", "user_identities"
       CASCADE`,
    );
    await client.query(
      `INSERT INTO "workspaces"
        ("id", "slug", "display_name", "type", "updated_at")
       VALUES ($1::uuid, 'contact-app', 'Contact App', 'agency', CURRENT_TIMESTAMP)`,
      [ids.workspace],
    );
    await client.query(
      `INSERT INTO "branches" ("id", "workspace_id", "name", "updated_at")
       VALUES
        ($1::uuid, $3::uuid, 'Branch A', CURRENT_TIMESTAMP),
        ($2::uuid, $3::uuid, 'Branch B', CURRENT_TIMESTAMP)`,
      [ids.branchA, ids.branchB, ids.workspace],
    );
    await client.query(
      `INSERT INTO "user_identities" ("id", "updated_at")
       VALUES ($1::uuid, CURRENT_TIMESTAMP)`,
      [ids.ownerIdentity],
    );
    await client.query(
      `INSERT INTO "memberships"
        ("id", "workspace_id", "user_identity_id", "scope_mode", "updated_at")
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'workspace', CURRENT_TIMESTAMP)`,
      [ids.ownerMembership, ids.workspace, ids.ownerIdentity],
    );
    await client.query(
      `INSERT INTO "authentication_provider_links"
        ("user_identity_id", "provider", "provider_subject")
       VALUES ($1::uuid, 'supabase', $2::uuid)`,
      [ids.ownerIdentity, ids.ownerAuth],
    );
    await client.query(
      `INSERT INTO "membership_roles"
        ("workspace_id", "membership_id", "role_code")
       VALUES ($1::uuid, $2::uuid, 'workspace_owner')`,
      [ids.workspace, ids.ownerMembership],
    );
    await addUser(client, {
      identityId: ids.managerIdentity,
      authSubject: ids.managerAuth,
      membershipId: ids.managerMembership,
      role: "branch_manager",
      branchId: ids.branchA,
    });
    await addUser(client, {
      identityId: ids.negotiatorAIdentity,
      authSubject: ids.negotiatorAAuth,
      membershipId: ids.negotiatorAMembership,
      role: "negotiator",
      branchId: ids.branchA,
    });
    await addUser(client, {
      identityId: ids.negotiatorBIdentity,
      authSubject: ids.negotiatorBAuth,
      membershipId: ids.negotiatorBMembership,
      role: "negotiator",
      branchId: ids.branchB,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const communication = {
  preferred: "email" as const,
  doNotEmail: false,
  doNotTelephone: false,
  doNotSms: false,
  doNotWhatsApp: false,
  doNotPost: false,
};

async function createPerson(email = "owner@example.test") {
  const result = await createContact({
    authSubject: ids.managerAuth,
    workspaceSlug: "contact-app",
    branchId: ids.branchA,
    kind: "person",
    details: {
      title: "Ms",
      firstName: "Olivia",
      middleNames: "",
      lastName: "Owner",
      preferredName: "Liv",
    },
    communication,
    contactPoints: [
      {
        kind: "email",
        label: "Personal",
        value: email,
        isPreferred: true,
      },
    ],
    addresses: [
      {
        kind: "individual",
        addressLine1: "1 High Street",
        addressLine2: "",
        locality: "",
        townCity: "London",
        county: "",
        postcode: "SW1A 1AA",
        countryCode: "GB",
      },
    ],
  });
  if (!result.ok) throw new Error(`Contact creation failed: ${result.error}`);
  return result.contactId;
}

async function createOrganisation(authSubject: string, branchId: string) {
  const result = await createContact({
    authSubject,
    workspaceSlug: "contact-app",
    branchId,
    kind: "organisation",
    details: {
      type: "limited_company",
      legalName: "Linked Lettings Limited",
      tradingName: "",
      registrationNumber: "",
      vatNumber: "",
    },
    communication: { ...communication, preferred: null },
    contactPoints: [],
    addresses: [],
  });
  if (!result.ok) {
    throw new Error(`Organisation creation failed: ${result.error}`);
  }
  return result.contactId;
}

beforeEach(seed);
afterAll(async () => {
  await db.$disconnect();
  await adminPool.end();
});

describe("contact application layer", () => {
  it("switches query compilation (JIT) off inside verified transactions only", async () => {
    const setting = () =>
      db.$queryRaw<{ jit: string }[]>`SELECT current_setting('jit') AS jit`;
    const before = await setting();
    const inside = await withVerifiedIdentity(
      ids.managerAuth,
      (transaction) =>
        transaction.$queryRaw<
          { jit: string }[]
        >`SELECT current_setting('jit') AS jit`,
    );
    expect(inside).toEqual([{ jit: "off" }]);
    // The setting is local to that transaction, never left on the connection.
    await expect(setting()).resolves.toEqual(before);
  });

  it("creates, reads and lists an audited contact", async () => {
    const contactId = await createPerson();
    const contact = await getContact({
      authSubject: ids.managerAuth,
      workspaceSlug: "contact-app",
      contactId,
    });
    expect(contact).toMatchObject({
      id: contactId,
      firstName: "Olivia",
      contactPoints: [{ normalizedValue: "owner@example.test" }],
      addresses: [{ postcode: "SW1A1AA" }],
    });
    const contacts = await listContacts({
      authSubject: ids.managerAuth,
      workspaceSlug: "contact-app",
      query: "Olivia",
    });
    expect(contacts?.map(({ id }) => id)).toEqual([contactId]);
    const audit = await adminPool.query(
      `SELECT "outcome" FROM "audit_events"
       WHERE "action" = 'contact.create' AND "target_id" = $1`,
      [contactId],
    );
    expect(audit.rows).toEqual([{ outcome: "succeeded" }]);
  });

  it("does not reveal a contact outside the member's branch", async () => {
    const contactId = await createPerson();
    await expect(
      getContact({
        authSubject: ids.negotiatorBAuth,
        workspaceSlug: "contact-app",
        contactId,
      }),
    ).resolves.toBeNull();
    await expect(
      listContacts({
        authSubject: ids.negotiatorBAuth,
        workspaceSlug: "contact-app",
      }),
    ).resolves.toEqual([]);
  });

  it("pages the contact list, filters by branch and respects branch scope", async () => {
    for (let index = 0; index < 26; index += 1) {
      await createPerson(`paged${index}@example.test`);
    }
    const base = { authSubject: ids.managerAuth, workspaceSlug: "contact-app" };
    const first = await listContactPage({ ...base });
    expect(first?.items).toHaveLength(25);
    expect(first).toMatchObject({ page: 1, hasPrevious: false, hasNext: true });
    // Only what the list shows reaches the browser: no branch-wide counts,
    // identifiers or flags from the full contact row.
    expect(Object.keys(first!.items[0]!).sort()).toEqual([
      "id",
      "kind",
      "name",
      "preferredContact",
      "primaryBranch",
      "reference",
      "status",
      "updatedAt",
    ]);
    const second = await listContactPage({ ...base, page: 2 });
    expect(second?.items).toHaveLength(1);
    expect(second).toMatchObject({ hasPrevious: true, hasNext: false });
    expect(first?.items.map(({ id }) => id)).not.toContain(
      second?.items[0]?.id,
    );
    await expect(
      listContactPage({ ...base, branchId: ids.branchA }),
    ).resolves.toMatchObject({ hasNext: true });
    await expect(
      listContactPage({ ...base, branchId: ids.branchB }),
    ).resolves.toMatchObject({ items: [], hasNext: false });
    await expect(
      listContactPage({ ...base, branchId: "not-a-uuid" }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      listContactPage({ ...base, state: "archived" }),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      listContactPage({
        authSubject: ids.negotiatorBAuth,
        workspaceSlug: "contact-app",
      }),
    ).resolves.toMatchObject({ items: [], hasNext: false });
  });

  it("allows routine edits and scoped duplicate suggestions", async () => {
    const contactId = await createPerson();
    const contact = await getContact({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      contactId,
    });
    const result = await updateContact({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      contactId,
      kind: "person",
      details: {
        title: "Ms",
        firstName: "Olivia",
        middleNames: "Rose",
        lastName: "Owner",
        preferredName: "Liv",
      },
      communication,
      contactPoints: contact!.contactPoints.map((point) => ({
        id: point.id,
        kind: "email" as const,
        label: point.label ?? "",
        value: point.value,
        isPreferred: point.isPreferred,
      })),
      addresses: contact!.addresses.map((address) => ({
        id: address.id,
        kind: "individual" as const,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 ?? "",
        locality: address.locality ?? "",
        townCity: address.townCity,
        county: address.county ?? "",
        postcode: address.postcode,
        countryCode: address.countryCode,
      })),
    });
    expect(result).toEqual({ ok: true, contactId });
    const candidates = await findDuplicateContacts({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      email: "OWNER@example.test",
    });
    expect(candidates).toMatchObject([
      { strength: "strong", matchedFields: ["email"] },
    ]);
    await expect(
      findDuplicateContacts({
        authSubject: ids.negotiatorBAuth,
        workspaceSlug: "contact-app",
        email: "owner@example.test",
      }),
    ).resolves.toEqual([]);
  });

  it("reserves archive and organisation identity changes for managers", async () => {
    const contactId = await createPerson();
    await expect(
      archiveContact({
        authSubject: ids.negotiatorAAuth,
        workspaceSlug: "contact-app",
        contactId,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      archiveContact({
        authSubject: ids.managerAuth,
        workspaceSlug: "contact-app",
        contactId,
      }),
    ).resolves.toEqual({ ok: true, contactId });
    expect(
      await listContacts({
        authSubject: ids.managerAuth,
        workspaceSlug: "contact-app",
      }),
    ).toEqual([]);
    await expect(
      reactivateContact({
        authSubject: ids.managerAuth,
        workspaceSlug: "contact-app",
        contactId,
      }),
    ).resolves.toEqual({ ok: true, contactId });

    const organisation = await createContact({
      authSubject: ids.managerAuth,
      workspaceSlug: "contact-app",
      branchId: ids.branchA,
      kind: "organisation",
      details: {
        type: "limited_company",
        legalName: "Oakfield Limited",
        tradingName: "Oakfield",
        registrationNumber: "AB123456",
        vatNumber: "",
      },
      communication,
      contactPoints: [],
      addresses: [],
    });
    if (!organisation.ok) throw new Error("Organisation creation failed.");
    await expect(
      updateContact({
        authSubject: ids.negotiatorAAuth,
        workspaceSlug: "contact-app",
        contactId: organisation.contactId,
        kind: "organisation",
        details: {
          type: "limited_company",
          legalName: "Oakfield Limited",
          tradingName: "Oakfield Homes",
          registrationNumber: "AB123456",
          vatNumber: "",
        },
        communication,
        contactPoints: [],
        addresses: [],
      }),
    ).resolves.toEqual({ ok: true, contactId: organisation.contactId });
    await expect(
      updateContact({
        authSubject: ids.negotiatorAAuth,
        workspaceSlug: "contact-app",
        contactId: organisation.contactId,
        kind: "organisation",
        details: {
          type: "limited_company",
          legalName: "Changed Limited",
          tradingName: "Oakfield Homes",
          registrationNumber: "AB123456",
          vatNumber: "",
        },
        communication,
        contactPoints: [],
        addresses: [],
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      updateOrganisationIdentity({
        authSubject: ids.negotiatorAAuth,
        workspaceSlug: "contact-app",
        contactId: organisation.contactId,
        details: {
          type: "limited_company",
          legalName: "Changed Limited",
          tradingName: "Changed",
          registrationNumber: "AB123456",
          vatNumber: "",
        },
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
  });

  it("reserves organisation-person links for managers with access to both contacts", async () => {
    const personId = await createPerson();
    const organisationId = await createOrganisation(
      ids.managerAuth,
      ids.branchA,
    );
    const link = {
      workspaceSlug: "contact-app",
      organisationContactId: organisationId,
      personContactId: personId,
      relationshipLabel: " Director ",
      isPrimary: true,
    };
    await expect(
      linkOrganisationPerson({ ...link, authSubject: ids.negotiatorAAuth }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      linkOrganisationPerson({ ...link, authSubject: ids.managerAuth }),
    ).resolves.toEqual({ ok: true, contactId: organisationId });
    await expect(
      linkOrganisationPerson({ ...link, authSubject: ids.managerAuth }),
    ).resolves.toEqual({ ok: false, error: "invalid_state" });

    const organisation = await getContact({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      contactId: organisationId,
    });
    expect(organisation?.organisationLinks).toMatchObject([
      {
        relationshipLabel: "Director",
        isPrimary: true,
        personContact: { id: personId },
      },
    ]);
    const person = await getContact({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      contactId: personId,
    });
    expect(person?.personLinks).toMatchObject([
      { organisationContact: { id: organisationId } },
    ]);

    const hiddenOrganisationId = await createOrganisation(
      ids.ownerAuth,
      ids.branchB,
    );
    await expect(
      linkOrganisationPerson({
        ...link,
        organisationContactId: hiddenOrganisationId,
        authSubject: ids.managerAuth,
      }),
    ).resolves.toEqual({ ok: false, error: "contact_not_found" });
  });

  it("shares a linked person with the organisation's branch", async () => {
    const personId = await createPerson();
    const organisationId = await createOrganisation(ids.ownerAuth, ids.branchB);
    await expect(
      getContact({
        authSubject: ids.negotiatorBAuth,
        workspaceSlug: "contact-app",
        contactId: personId,
      }),
    ).resolves.toBeNull();
    await expect(
      linkOrganisationPerson({
        authSubject: ids.ownerAuth,
        workspaceSlug: "contact-app",
        organisationContactId: organisationId,
        personContactId: personId,
        relationshipLabel: "",
        isPrimary: false,
      }),
    ).resolves.toEqual({ ok: true, contactId: organisationId });
    const shared = await getContact({
      authSubject: ids.negotiatorBAuth,
      workspaceSlug: "contact-app",
      contactId: personId,
    });
    expect(shared?.branchLinks.map(({ branchId }) => branchId)).toEqual([
      ids.branchB,
    ]);
    const allBranches = await getContact({
      authSubject: ids.ownerAuth,
      workspaceSlug: "contact-app",
      contactId: personId,
    });
    expect(
      allBranches?.branchLinks.map(({ branchId, isPrimary }) => [
        branchId,
        isPrimary,
      ]),
    ).toEqual([
      [ids.branchA, true],
      [ids.branchB, false],
    ]);
    const audit = await adminPool.query(
      `SELECT "metadata" FROM "audit_events"
       WHERE "action" = 'contact.organisation_person.link'
         AND "outcome" = 'succeeded'`,
    );
    expect(audit.rows[0].metadata).toMatchObject({
      personContactId: personId,
      addedBranchIds: [ids.branchB],
    });
  });

  it("keeps one main contact and preserves ended links as history", async () => {
    const firstId = await createPerson("first@example.test");
    const secondId = await createPerson("second@example.test");
    const organisationId = await createOrganisation(
      ids.managerAuth,
      ids.branchA,
    );
    for (const personContactId of [firstId, secondId]) {
      const result = await linkOrganisationPerson({
        authSubject: ids.managerAuth,
        workspaceSlug: "contact-app",
        organisationContactId: organisationId,
        personContactId,
        relationshipLabel: "",
        isPrimary: true,
      });
      expect(result.ok).toBe(true);
    }
    const links = await getContact({
      authSubject: ids.managerAuth,
      workspaceSlug: "contact-app",
      contactId: organisationId,
    });
    expect(
      links?.organisationLinks.map(({ personContact, isPrimary }) => [
        personContact.id,
        isPrimary,
      ]),
    ).toEqual([
      [secondId, true],
      [firstId, false],
    ]);
    const firstLink = links!.organisationLinks.find(
      ({ personContact }) => personContact.id === firstId,
    )!;
    const update = {
      workspaceSlug: "contact-app",
      organisationContactId: organisationId,
      linkId: firstLink.id,
      relationshipLabel: "Director",
      isPrimary: true,
    };
    await expect(
      updateOrganisationPersonLink({
        ...update,
        authSubject: ids.negotiatorAAuth,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      updateOrganisationPersonLink({ ...update, authSubject: ids.managerAuth }),
    ).resolves.toEqual({ ok: true, contactId: organisationId });
    await expect(
      endOrganisationPersonLink({
        authSubject: ids.managerAuth,
        workspaceSlug: "contact-app",
        organisationContactId: organisationId,
        linkId: firstLink.id,
      }),
    ).resolves.toEqual({ ok: true, contactId: organisationId });
    const after = await getContact({
      authSubject: ids.managerAuth,
      workspaceSlug: "contact-app",
      contactId: organisationId,
    });
    expect(
      after?.organisationLinks.map(({ personContact, isPrimary }) => [
        personContact.id,
        isPrimary,
      ]),
    ).toEqual([[secondId, false]]);
    const history = await adminPool.query(
      `SELECT "ended_at" IS NOT NULL AS "ended", "is_primary"
       FROM "organisation_person_links" WHERE "id" = $1`,
      [firstLink.id],
    );
    expect(history.rows).toEqual([{ ended: true, is_primary: false }]);
  });

  it("creates and links a new person in the organisation's branch in one step", async () => {
    const organisationId = await createOrganisation(
      ids.managerAuth,
      ids.branchA,
    );
    const input = {
      workspaceSlug: "contact-app",
      organisationContactId: organisationId,
      details: {
        title: "",
        firstName: "Nadia",
        middleNames: "",
        lastName: "Director",
        preferredName: "",
      },
      contactPoints: [
        {
          kind: "email" as const,
          label: "Work",
          value: "nadia@example.test",
          isPreferred: true,
        },
      ],
      relationshipLabel: "Director",
      isPrimary: true,
    };
    await expect(
      createAndLinkOrganisationPerson({
        ...input,
        authSubject: ids.negotiatorAAuth,
      }),
    ).resolves.toEqual({ ok: false, error: "access_denied" });
    await expect(
      createAndLinkOrganisationPerson({
        ...input,
        contactPoints: [],
        authSubject: ids.managerAuth,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_input" });
    await expect(
      createAndLinkOrganisationPerson({
        ...input,
        authSubject: ids.managerAuth,
      }),
    ).resolves.toEqual({ ok: true, contactId: organisationId });

    const organisation = await getContact({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      contactId: organisationId,
    });
    expect(organisation?.organisationLinks).toMatchObject([
      {
        relationshipLabel: "Director",
        isPrimary: true,
        personContact: { firstName: "Nadia", lastName: "Director" },
      },
    ]);
    const personId = organisation!.organisationLinks[0]!.personContact.id;
    const person = await getContact({
      authSubject: ids.negotiatorAAuth,
      workspaceSlug: "contact-app",
      contactId: personId,
    });
    expect(
      person?.branchLinks.map(({ branchId, isPrimary }) => [
        branchId,
        isPrimary,
      ]),
    ).toEqual([[ids.branchA, true]]);
    const people = await adminPool.query(
      `SELECT count(*)::int AS "count" FROM "contacts" WHERE "kind" = 'person'`,
    );
    expect(people.rows).toEqual([{ count: 1 }]);
  });

  describe("contact notes", () => {
    const base = { workspaceSlug: "contact-app" };

    async function shareWithBranchB(contactId: string) {
      await adminPool.query(
        `INSERT INTO "contact_branch_links" (
          "workspace_id", "contact_id", "branch_id", "is_primary",
          "created_by_membership_id", "updated_at"
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, false, $4::uuid,
          CURRENT_TIMESTAMP)`,
        [ids.workspace, contactId, ids.branchB, ids.managerMembership],
      );
    }

    function listFor(
      authSubject: string,
      contactId: string,
      includeVoided = false,
    ) {
      return listContactNotes({
        ...base,
        authSubject,
        contactId,
        includeVoided,
      });
    }

    it("adds attributed notes in the writer's branch and audits without text", async () => {
      const contactId = await createPerson();
      await adminPool.query(
        `UPDATE "user_identities" SET "first_name" = 'Nora', "last_name" = 'Negotiator'
         WHERE "id" = $1::uuid`,
        [ids.negotiatorAIdentity],
      );
      const added = await addContactNote({
        ...base,
        authSubject: ids.negotiatorAAuth,
        contactId,
        body: "  Landlord wants a valuation next week.  ",
        occurredAt: new Date("2026-10-01T09:00:00Z"),
        shareWithAllBranches: false,
      });
      expect(added.ok).toBe(true);

      const notes = await listFor(ids.managerAuth, contactId);
      expect(notes).toMatchObject([
        {
          body: "Landlord wants a valuation next week.",
          authorName: "Nora Negotiator",
          branchName: "Branch A",
          agencyWide: false,
          edited: false,
          canManage: true,
        },
      ]);
      expect(notes?.[0]?.occurredAt.toISOString()).toBe(
        "2026-10-01T09:00:00.000Z",
      );
      const negotiatorView = await listFor(ids.negotiatorAAuth, contactId);
      expect(negotiatorView?.[0]?.canManage).toBe(false);

      const audit = await adminPool.query(
        `SELECT "metadata"::text AS "metadata" FROM "audit_events"
         WHERE "action" = 'contact.note.create' AND "outcome" = 'succeeded'`,
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].metadata).not.toContain("valuation");
    });

    it("rejects invalid, future-dated and unauthorised notes", async () => {
      const contactId = await createPerson();
      const note = {
        ...base,
        contactId,
        body: "A note",
        shareWithAllBranches: false,
      };
      await expect(
        addContactNote({
          ...note,
          authSubject: ids.negotiatorAAuth,
          body: "   ",
        }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
      await expect(
        addContactNote({
          ...note,
          authSubject: ids.negotiatorAAuth,
          occurredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
      await expect(
        addContactNote({ ...note, authSubject: ids.negotiatorBAuth }),
      ).resolves.toEqual({ ok: false, error: "contact_not_found" });
    });

    it("keeps branch notes private on a shared contact unless shared with all branches", async () => {
      const contactId = await createPerson();
      await shareWithBranchB(contactId);
      const add = (authSubject: string, shareWithAllBranches: boolean) =>
        addContactNote({
          ...base,
          authSubject,
          contactId,
          body: shareWithAllBranches ? "Agency note" : "Branch note",
          shareWithAllBranches,
        });
      await add(ids.negotiatorAAuth, false);
      await add(ids.managerAuth, true);
      const bAdded = await add(ids.negotiatorBAuth, false);
      expect(bAdded.ok).toBe(true);

      const bodies = async (authSubject: string) =>
        ((await listFor(authSubject, contactId)) ?? [])
          .map(({ body }) => body)
          .sort();
      expect(await bodies(ids.negotiatorAAuth)).toEqual([
        "Agency note",
        "Branch note",
      ]);
      expect(await bodies(ids.negotiatorBAuth)).toEqual([
        "Agency note",
        "Branch note",
      ]);
      const branchB = await listFor(ids.negotiatorBAuth, contactId);
      expect(branchB?.map(({ branchName }) => branchName).sort()).toEqual([
        "Branch A",
        "Branch B",
      ]);
      const aNotes = await listFor(ids.negotiatorAAuth, contactId);
      expect(aNotes?.map(({ branchName }) => branchName).sort()).toEqual([
        "Branch A",
        "Branch A",
      ]);
      // The owner has workspace scope and sees everything.
      expect((await listFor(ids.ownerAuth, contactId))?.length).toBe(3);
    });

    it("lets managers correct and void notes with reasons while keeping history", async () => {
      const contactId = await createPerson();
      const added = await addContactNote({
        ...base,
        authSubject: ids.negotiatorAAuth,
        contactId,
        body: "Original wording",
        shareWithAllBranches: false,
      });
      if (!added.ok) throw new Error("Note creation failed.");
      const manage = {
        ...base,
        contactId,
        noteId: added.noteId,
      };
      const edit = {
        ...manage,
        body: "Corrected wording",
        occurredAt: null,
        shareWithAllBranches: false,
        reason: "Typo",
      };
      await expect(
        editContactNote({ ...edit, authSubject: ids.negotiatorAAuth }),
      ).resolves.toEqual({ ok: false, error: "access_denied" });
      await expect(
        editContactNote({ ...edit, authSubject: ids.managerAuth, reason: " " }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
      await expect(
        editContactNote({ ...edit, authSubject: ids.managerAuth }),
      ).resolves.toEqual({ ok: true, noteId: added.noteId });

      const history = await adminPool.query(
        `SELECT "previous_body", "edit_reason" FROM "contact_note_revisions"`,
      );
      expect(history.rows).toEqual([
        { previous_body: "Original wording", edit_reason: "Typo" },
      ]);
      expect(
        (await listFor(ids.negotiatorAAuth, contactId))?.[0],
      ).toMatchObject({ body: "Corrected wording", edited: true });

      await expect(
        voidContactNote({
          ...manage,
          authSubject: ids.negotiatorAAuth,
          reason: "Wrong contact",
        }),
      ).resolves.toEqual({ ok: false, error: "access_denied" });
      await expect(
        voidContactNote({
          ...manage,
          authSubject: ids.managerAuth,
          reason: "Wrong contact",
        }),
      ).resolves.toEqual({ ok: true, noteId: added.noteId });
      expect(await listFor(ids.managerAuth, contactId)).toEqual([]);
      const voided = await listFor(ids.managerAuth, contactId, true);
      expect(voided?.[0]).toMatchObject({
        voided: true,
        voidReason: "Wrong contact",
        canManage: false,
      });
      // Negotiators cannot ask for voided notes.
      expect(await listFor(ids.negotiatorAAuth, contactId, true)).toEqual([]);
      await expect(
        editContactNote({ ...edit, authSubject: ids.managerAuth }),
      ).resolves.toEqual({ ok: false, error: "invalid_state" });
    });

    it("stops a manager changing another branch's agency-wide note", async () => {
      const contactId = await createPerson();
      await shareWithBranchB(contactId);
      const added = await addContactNote({
        ...base,
        authSubject: ids.negotiatorBAuth,
        contactId,
        body: "Branch B shares this",
        shareWithAllBranches: true,
      });
      if (!added.ok) throw new Error("Note creation failed.");
      const notes = await listFor(ids.managerAuth, contactId);
      expect(notes).toMatchObject([
        { branchName: "Branch B", canManage: false },
      ]);
      await expect(
        editContactNote({
          ...base,
          authSubject: ids.managerAuth,
          contactId,
          noteId: added.noteId,
          body: "Changed by A",
          occurredAt: null,
          shareWithAllBranches: true,
          reason: "Because",
        }),
      ).resolves.toEqual({ ok: false, error: "access_denied" });
      await expect(
        voidContactNote({
          ...base,
          authSubject: ids.managerAuth,
          contactId,
          noteId: added.noteId,
          reason: "Because",
        }),
      ).resolves.toEqual({ ok: false, error: "access_denied" });
    });
  });
});
