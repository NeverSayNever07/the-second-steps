// Checks for a private document's file before it is stored. Pure functions:
// bytes and names in, a typed outcome out. The detected content decides the
// type, never the filename or the type the browser claims
// (.cursor/plans/c0-design-private-documents.md).

/** Largest file accepted, 10 MB, matching the private bucket's own limit. */
export const DOCUMENT_MAX_BYTES = 10_485_760;

/** Longest display name kept, including its extension. */
export const DISPLAY_NAME_MAX = 120;

export const DOCUMENT_KINDS = [
  "instruction_agreement",
  "compliance_evidence",
  "listing_photo",
  "listing_floorplan",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type DocumentMedia = "pdf" | "jpeg" | "png";

const ALLOWED_MEDIA: Record<DocumentKind, readonly DocumentMedia[]> = {
  // Owner decision 8: agreement uploads are PDF only.
  instruction_agreement: ["pdf"],
  // Owner decision 28: compliance evidence is PDF, JPEG or PNG.
  compliance_evidence: ["pdf", "jpeg", "png"],
  // Listing media (ADR-008 amendment, 2026-10-21): photos are JPEG or PNG,
  // floorplans may also be a PDF.
  listing_photo: ["jpeg", "png"],
  listing_floorplan: ["pdf", "jpeg", "png"],
};

const EXTENSION: Record<DocumentMedia, string> = {
  pdf: "pdf",
  jpeg: "jpg",
  png: "png",
};

const CONTENT_TYPE: Record<DocumentMedia, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
};

export type DocumentFileRefusal =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "type_not_allowed"
  | "encrypted_pdf"
  | "incomplete_file";

export type DocumentFileCheck =
  | { ok: true; media: DocumentMedia }
  | { ok: false; reason: DocumentFileRefusal };

export function isDocumentKind(value: unknown): value is DocumentKind {
  return DOCUMENT_KINDS.some((kind) => kind === value);
}

export function isDocumentMedia(value: unknown): value is DocumentMedia {
  return value === "pdf" || value === "jpeg" || value === "png";
}

export function documentExtension(media: DocumentMedia): string {
  return EXTENSION[media];
}

export function documentContentType(media: DocumentMedia): string {
  return CONTENT_TYPE[media];
}

/** The tail searched for end-of-file markers. */
const TAIL_BYTES = 1024;

const PDF_HEADER = ascii("%PDF-");
const PDF_END = ascii("%%EOF");
// Any occurrence refuses the file. A rare unencrypted PDF that mentions the
// word is refused too, which is the safe direction. A deliberately disguised
// marker can slip past; acceptable only for controlled fictional files.
const PDF_ENCRYPT = ascii("/Encrypt");
const JPEG_START = [0xff, 0xd8, 0xff];
const JPEG_END = [0xff, 0xd9];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR = ascii("IHDR");
const PNG_IEND = ascii("IEND");

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function startsWithAt(
  bytes: Uint8Array,
  pattern: readonly number[],
  offset: number,
): boolean {
  if (offset < 0 || offset + pattern.length > bytes.length) return false;
  return pattern.every((byte, index) => bytes[offset + index] === byte);
}

function indexOfBytes(
  bytes: Uint8Array,
  pattern: readonly number[],
  from = 0,
): number {
  const last = bytes.length - pattern.length;
  for (let offset = Math.max(from, 0); offset <= last; offset += 1) {
    if (startsWithAt(bytes, pattern, offset)) return offset;
  }
  return -1;
}

function tailContains(bytes: Uint8Array, pattern: readonly number[]): boolean {
  return indexOfBytes(bytes, pattern, bytes.length - TAIL_BYTES) !== -1;
}

function detectMedia(bytes: Uint8Array): DocumentMedia | null {
  if (startsWithAt(bytes, PDF_HEADER, 0)) return "pdf";
  if (startsWithAt(bytes, JPEG_START, 0)) return "jpeg";
  if (startsWithAt(bytes, PNG_SIGNATURE, 0)) return "png";
  return null;
}

function isComplete(bytes: Uint8Array, media: DocumentMedia): boolean {
  switch (media) {
    case "pdf":
      return tailContains(bytes, PDF_END);
    case "jpeg":
      return tailContains(bytes, JPEG_END);
    case "png": {
      // IHDR is the first chunk; IEND is the last, followed only by its CRC.
      const hasHeader = startsWithAt(bytes, PNG_IHDR, 12);
      const hasEnd = startsWithAt(bytes, PNG_IEND, bytes.length - 8);
      return hasHeader && hasEnd;
    }
    default: {
      const unhandled: never = media;
      return unhandled;
    }
  }
}

/**
 * Checks a file for the given kind of document: size, real content type,
 * whether the kind allows that type, whether the file is complete (which also
 * catches a body cut short in transit) and, for a PDF, that it is not
 * password-protected or encrypted (owner decision 9).
 */
export function checkDocumentFile(
  kind: DocumentKind,
  bytes: Uint8Array,
): DocumentFileCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > DOCUMENT_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  const media = detectMedia(bytes);
  if (!media) return { ok: false, reason: "unsupported_type" };
  if (!ALLOWED_MEDIA[kind].includes(media)) {
    return { ok: false, reason: "type_not_allowed" };
  }
  if (!isComplete(bytes, media))
    return { ok: false, reason: "incomplete_file" };
  if (media === "pdf" && indexOfBytes(bytes, PDF_ENCRYPT) !== -1) {
    return { ok: false, reason: "encrypted_pdf" };
  }

  return { ok: true, media };
}

// Control characters, quotes, backslash, semicolon and Unicode direction
// marks or overrides, any of which could break a download header or make a
// name display misleadingly (for example "invoice‮fdp.exe").
const UNSAFE_NAME_CHARACTERS = /[\u0000-\u001f\u007f-\u009f"'`\\;؜‎‏‪-‮⁦-⁩]/g;

/**
 * The name shown and offered on download: the original file's own name with
 * any folder path and unsafe characters removed, its extension replaced by
 * the detected type's, within DISPLAY_NAME_MAX characters.
 */
export function documentDisplayName(
  originalName: string,
  media: DocumentMedia,
): string {
  const extension = `.${EXTENSION[media]}`;
  const lastSegment = originalName.split(/[/\\]/).pop() ?? "";
  const cleaned = lastSegment
    .normalize("NFC")
    .replace(UNSAFE_NAME_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
  const dot = cleaned.lastIndexOf(".");
  const withoutExtension = (dot >= 0 ? cleaned.slice(0, dot) : cleaned)
    .replace(/^[.\s]+/, "")
    .trim();
  const base = Array.from(withoutExtension)
    .slice(0, DISPLAY_NAME_MAX - extension.length)
    .join("")
    .trim();

  return `${base === "" ? "document" : base}${extension}`;
}

/**
 * Where the file lives in the private bucket: built only from the document's
 * own workspace, id and detected type, never from user input or names.
 */
export function documentObjectKey(document: {
  workspaceId: string;
  id: string;
  media: DocumentMedia;
}): string {
  return `${document.workspaceId}/${document.id}.${EXTENSION[document.media]}`;
}
