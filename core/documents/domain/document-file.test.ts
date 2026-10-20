import { describe, expect, it } from "vitest";
import {
  checkDocumentFile,
  documentDisplayName,
  DISPLAY_NAME_MAX,
  DOCUMENT_MAX_BYTES,
  isDocumentKind,
} from "./document-file";

const text = (value: string) => Array.from(value, (c) => c.charCodeAt(0));
const file = (...parts: number[][]) => new Uint8Array(parts.flat());

const PDF = file(
  text("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"),
);
const JPEG = file([0xff, 0xd8, 0xff, 0xe0], text("JFIF"), [0xff, 0xd9]);
const PNG = file(
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  [0, 0, 0, 13],
  text("IHDR"),
  new Array<number>(17).fill(0),
  [0, 0, 0, 0],
  text("IEND"),
  [0xae, 0x42, 0x60, 0x82],
);

describe("checkDocumentFile", () => {
  it("accepts a complete PDF for either kind", () => {
    expect(checkDocumentFile("instruction_agreement", PDF)).toEqual({
      ok: true,
      media: "pdf",
    });
    expect(checkDocumentFile("compliance_evidence", PDF)).toEqual({
      ok: true,
      media: "pdf",
    });
  });

  it("accepts JPEG and PNG only as compliance evidence", () => {
    expect(checkDocumentFile("compliance_evidence", JPEG)).toEqual({
      ok: true,
      media: "jpeg",
    });
    expect(checkDocumentFile("compliance_evidence", PNG)).toEqual({
      ok: true,
      media: "png",
    });
    expect(checkDocumentFile("instruction_agreement", JPEG)).toEqual({
      ok: false,
      reason: "type_not_allowed",
    });
    expect(checkDocumentFile("instruction_agreement", PNG)).toEqual({
      ok: false,
      reason: "type_not_allowed",
    });
  });

  it("refuses an empty or oversized file", () => {
    expect(checkDocumentFile("compliance_evidence", new Uint8Array())).toEqual({
      ok: false,
      reason: "empty",
    });
    const oversized = new Uint8Array(DOCUMENT_MAX_BYTES + 1);
    oversized.set(PDF);
    expect(checkDocumentFile("compliance_evidence", oversized)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("accepts a file of exactly the maximum size", () => {
    const largest = new Uint8Array(DOCUMENT_MAX_BYTES);
    largest.set(PDF.subarray(0, 9));
    largest.set(text("%%EOF\n"), DOCUMENT_MAX_BYTES - 6);
    expect(checkDocumentFile("instruction_agreement", largest).ok).toBe(true);
  });

  it("decides the type from the content, not the name", () => {
    const html = file(text("<html><script>alert(1)</script></html>"));
    expect(checkDocumentFile("compliance_evidence", html)).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it("requires the PDF header at the very start", () => {
    const shifted = file(text("junk"), Array.from(PDF));
    expect(checkDocumentFile("instruction_agreement", shifted)).toEqual({
      ok: false,
      reason: "unsupported_type",
    });
  });

  it("refuses files cut short", () => {
    expect(
      checkDocumentFile("instruction_agreement", PDF.subarray(0, 20)),
    ).toEqual({ ok: false, reason: "incomplete_file" });
    expect(
      checkDocumentFile("compliance_evidence", JPEG.subarray(0, 6)),
    ).toEqual({ ok: false, reason: "incomplete_file" });
    expect(
      checkDocumentFile("compliance_evidence", PNG.subarray(0, PNG.length - 4)),
    ).toEqual({ ok: false, reason: "incomplete_file" });
  });

  it("refuses an encrypted or password-protected PDF", () => {
    const encrypted = file(
      text("%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>\n%%EOF\n"),
    );
    expect(checkDocumentFile("instruction_agreement", encrypted)).toEqual({
      ok: false,
      reason: "encrypted_pdf",
    });
  });
});

describe("documentDisplayName", () => {
  it("keeps the file's own name with the detected extension", () => {
    expect(documentDisplayName("Signed terms.PDF", "pdf")).toBe(
      "Signed terms.pdf",
    );
    expect(documentDisplayName("gas-safety.png", "jpeg")).toBe(
      "gas-safety.jpg",
    );
  });

  it("drops any folder path", () => {
    expect(documentDisplayName("C:\\Users\\me\\terms.pdf", "pdf")).toBe(
      "terms.pdf",
    );
    expect(documentDisplayName("../../etc/passwd", "pdf")).toBe("passwd.pdf");
  });

  it("removes characters that could break a header or mislead", () => {
    expect(documentDisplayName('a"b;c\r\nd\u0000.pdf', "pdf")).toBe("abcd.pdf");
    expect(documentDisplayName("invoice\u202efdp.exe", "pdf")).toBe(
      "invoicefdp.pdf",
    );
  });

  it("falls back to a neutral name", () => {
    expect(documentDisplayName("", "pdf")).toBe("document.pdf");
    expect(documentDisplayName(".pdf", "pdf")).toBe("document.pdf");
    expect(documentDisplayName(";;;", "png")).toBe("document.png");
  });

  it("limits the length", () => {
    const name = documentDisplayName(`${"x".repeat(500)}.pdf`, "pdf");
    expect(name).toHaveLength(DISPLAY_NAME_MAX);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("isDocumentKind", () => {
  it("accepts only the two kinds", () => {
    expect(isDocumentKind("instruction_agreement")).toBe(true);
    expect(isDocumentKind("compliance_evidence")).toBe(true);
    expect(isDocumentKind("listing_photo")).toBe(false);
    expect(isDocumentKind(undefined)).toBe(false);
  });
});
