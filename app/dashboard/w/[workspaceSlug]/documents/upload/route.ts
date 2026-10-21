import type { NextRequest } from "next/server";
import { getAppUrl } from "@/core/auth/env";
import { getMfaVerifiedUser } from "@/core/auth/mfa";
import { attachComplianceEvidence } from "@/core/compliance/application/property-compliance";
import {
  EVIDENCE_HEADER,
  isDeclaredLengthAllowed,
  isRawFileBody,
  isSameOrigin,
  parseEvidenceHeader,
  parseUploadRequest,
  readCappedBody,
  UPLOAD_HEADER,
} from "@/core/documents/application/document-http";
import {
  authoriseDocumentUpload,
  uploadDocument,
  type UploadDocumentError,
} from "@/core/documents/application/documents";
import { createSupabaseDocumentStore } from "@/core/documents/data/supabase-document-store";
import { DOCUMENT_MAX_BYTES } from "@/core/documents/domain/document-file";
import { attachAgreementDraft } from "@/core/instructions/application/instructions";

// The body is the raw file. Everything that decides access travels in the
// query string and headers, and is checked before the body is read. The
// proxy skips this route (proxy.ts), so it checks the session itself.

function refuse(status: number, error: string) {
  return Response.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

const STATUS: Record<UploadDocumentError, number> = {
  access_denied: 403,
  record_not_found: 404,
  record_closed: 409,
  empty: 422,
  too_large: 413,
  unsupported_type: 422,
  type_not_allowed: 422,
  encrypted_pdf: 422,
  incomplete_file: 422,
  storage_unavailable: 503,
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceSlug: string }> },
) {
  const { workspaceSlug } = await context.params;
  const isFromZayto =
    isSameOrigin(request.headers.get("origin"), getAppUrl()) &&
    request.headers.get(UPLOAD_HEADER) === "1";
  if (!isFromZayto) return refuse(403, "forbidden");
  if (!isRawFileBody(request.headers.get("content-type"))) {
    return refuse(415, "unsupported_media_type");
  }
  if (
    !isDeclaredLengthAllowed(
      request.headers.get("content-length"),
      DOCUMENT_MAX_BYTES,
    )
  ) {
    return refuse(413, "too_large");
  }
  const parsed = parseUploadRequest(request.nextUrl.searchParams);
  if (!parsed.ok) return refuse(400, "invalid_input");

  const user = await getMfaVerifiedUser({ workspaceSlug });
  if (!user) return refuse(401, "sign_in_required");
  const actor = { authSubject: user.id, workspaceSlug };

  const { target } = parsed.request;

  const access = await authoriseDocumentUpload(actor, target);
  if (!access.ok) return refuse(STATUS[access.error], access.error);

  // Compliance evidence arrives with its area and typed facts, checked before
  // the file is read, so a mistake in them costs no upload (C3).
  let evidence: ReturnType<typeof parseEvidenceHeader> | null = null;
  if (target.kind === "compliance_evidence") {
    evidence = parseEvidenceHeader(request.headers.get(EVIDENCE_HEADER));
    if (!evidence.ok) {
      return evidence.fieldErrors
        ? Response.json(
            {
              ok: false,
              error: "invalid_evidence",
              fieldErrors: evidence.fieldErrors,
            },
            { status: 422, headers: { "Cache-Control": "no-store" } },
          )
        : refuse(400, "invalid_input");
    }
  }

  const body = await readCappedBody(request.body, DOCUMENT_MAX_BYTES);
  if (!body.ok) return refuse(413, "too_large");

  const result = await uploadDocument({
    actor,
    target,
    originalName: parsed.request.originalName,
    bytes: body.bytes,
    store: createSupabaseDocumentStore(),
    // An agreement PDF becomes the instruction's draft agreement (C2); a
    // compliance file becomes the area's next piece of evidence (C3).
    attach:
      target.kind === "instruction_agreement"
        ? attachAgreementDraft(target.instructionId)
        : evidence?.ok
          ? attachComplianceEvidence({
              propertyId: target.propertyId,
              area: evidence.area,
              facts: evidence.facts,
            })
          : undefined,
  });
  if (!result.ok) return refuse(STATUS[result.error], result.error);

  return Response.json(
    { ok: true, document: result.document },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
