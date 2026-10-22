import "server-only";

import {
  EVIDENCE_HEADER,
  isComplianceArea,
  validateEvidenceFacts,
  type ComplianceAreaCode,
  type EvidenceFactsErrors,
  type EvidenceFactsInput,
} from "@/core/compliance/domain/compliance";
import {
  documentContentType,
  isDocumentKind,
  type DocumentMedia,
} from "../domain/document-file";
import type { DocumentTarget } from "./documents";

// The HTTP edge of document upload and download: everything a Route Handler
// checks before or after the service, kept here so it can be tested without
// a server (.cursor/plans/c0-design-private-documents.md).

/** Longest original file name accepted from the query string. */
const ORIGINAL_NAME_MAX = 255;

/** The header a cross-site page cannot send without a preflight check. */
export const UPLOAD_HEADER = "x-zayto-upload";

export type UploadRequest = { target: DocumentTarget; originalName: string };

/**
 * The upload's target and file name, from the query string only, so access
 * is checked before the body is read.
 */
export function parseUploadRequest(
  searchParams: URLSearchParams,
): { ok: true; request: UploadRequest } | { ok: false } {
  const kind = searchParams.get("kind");
  const recordId = searchParams.get("recordId");
  const originalName = searchParams.get("name");
  const isNameValid =
    originalName !== null &&
    originalName.length > 0 &&
    originalName.length <= ORIGINAL_NAME_MAX;
  if (!isDocumentKind(kind) || !recordId || !isNameValid) return { ok: false };

  const target: DocumentTarget =
    kind === "instruction_agreement"
      ? { kind, instructionId: recordId }
      : kind === "compliance_evidence"
        ? { kind, propertyId: recordId }
        : { kind, listingId: recordId };
  return { ok: true, request: { target, originalName } };
}

export { EVIDENCE_HEADER };

/**
 * Longest encoded evidence header read. The facts are short, but each
 * non-ASCII character encodes to up to 9 characters, so a full 1,000
 * character note in another script needs about 9,000; headers stay well
 * inside Node's 16 KB total.
 */
const EVIDENCE_HEADER_MAX = 12_000;

const EVIDENCE_FACT_NAMES = [
  "reference",
  "provider",
  "eventOn",
  "expiresOn",
  "epcRating",
  "notes",
] as const;

/**
 * The area and facts a compliance upload carries, as URI-encoded JSON in a
 * header (not the query string, so typed notes stay out of URLs and logs).
 * The facts are validated here, before the file is read, so a mistake costs
 * no upload.
 */
export function parseEvidenceHeader(
  header: string | null,
  now: Date = new Date(),
):
  | { ok: true; area: ComplianceAreaCode; facts: EvidenceFactsInput }
  | { ok: false; fieldErrors: EvidenceFactsErrors }
  | { ok: false; fieldErrors?: undefined } {
  if (!header || header.length > EVIDENCE_HEADER_MAX) return { ok: false };
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(header));
  } catch {
    return { ok: false };
  }
  if (typeof value !== "object" || value === null) return { ok: false };
  const record = value as Record<string, unknown>;
  if (!isComplianceArea(record.area)) return { ok: false };

  // Read only the known text fields; anything else is ignored.
  const facts: EvidenceFactsInput = {};
  for (const name of EVIDENCE_FACT_NAMES) {
    const entry = record[name];
    if (entry === undefined || entry === null) continue;
    if (typeof entry !== "string") return { ok: false };
    facts[name] = entry;
  }
  const checked = validateEvidenceFacts(record.area, facts, now);
  if (!checked.ok) return { ok: false, fieldErrors: checked.errors };
  return { ok: true, area: record.area, facts };
}

/**
 * True only when the request came from Zayto's own address: scheme, host and
 * port must all match. A missing Origin header is refused.
 */
export function isSameOrigin(originHeader: string | null, appUrl: string) {
  if (!originHeader) return false;
  try {
    return originHeader === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

/** True for exactly `application/octet-stream` (parameters ignored). */
export function isRawFileBody(contentType: string | null) {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/octet-stream";
}

/** True when the declared length is missing or within the limit. */
export function isDeclaredLengthAllowed(
  contentLength: string | null,
  maxBytes: number,
) {
  if (contentLength === null) return true;
  if (!/^\d+$/.test(contentLength)) return false;
  return Number(contentLength) <= maxBytes;
}

/**
 * Reads the request body, stopping as soon as it passes `maxBytes` whatever
 * the declared length said.
 */
export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  if (!body) return { ok: true, bytes: new Uint8Array() };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { ok: true, bytes };
}

function asciiFallback(displayName: string) {
  return displayName.replace(/[^\x20-\x7e]|["\\]/g, "_");
}

/** RFC 8187 encoding: encodeURIComponent leaves ' ( ) * unencoded. */
function encodeFilenameStar(displayName: string) {
  return encodeURIComponent(displayName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/**
 * Headers for a verified download: a non-cacheable attachment that the
 * browser must not sniff, run or display inline.
 */
export function downloadHeaders(document: {
  displayName: string;
  media: DocumentMedia;
  byteSize: number;
}): Headers {
  return new Headers({
    "Content-Type": documentContentType(document.media),
    "Content-Length": String(document.byteSize),
    "Content-Disposition": `attachment; filename="${asciiFallback(
      document.displayName,
    )}"; filename*=UTF-8''${encodeFilenameStar(document.displayName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
}
