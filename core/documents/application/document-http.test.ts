import { describe, expect, it } from "vitest";
import {
  downloadHeaders,
  parseEvidenceHeader,
  isDeclaredLengthAllowed,
  isRawFileBody,
  isSameOrigin,
  parseUploadRequest,
  readCappedBody,
} from "./document-http";

const params = (values: Record<string, string>) => new URLSearchParams(values);

function streamOf(...chunks: number[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
  });
}

describe("parseUploadRequest", () => {
  it("reads the target and name from the query string", () => {
    expect(
      parseUploadRequest(
        params({ kind: "compliance_evidence", recordId: "p1", name: "a.pdf" }),
      ),
    ).toEqual({
      ok: true,
      request: {
        target: { kind: "compliance_evidence", propertyId: "p1" },
        originalName: "a.pdf",
      },
    });
    expect(
      parseUploadRequest(
        params({
          kind: "instruction_agreement",
          recordId: "i1",
          name: "t.pdf",
        }),
      ),
    ).toMatchObject({
      ok: true,
      request: {
        target: { kind: "instruction_agreement", instructionId: "i1" },
      },
    });
  });

  it("refuses an unknown kind, or a missing id or name", () => {
    const invalid: Record<string, string>[] = [
      { kind: "listing_photo", recordId: "p1", name: "a.pdf" },
      { kind: "compliance_evidence", name: "a.pdf" },
      { kind: "compliance_evidence", recordId: "p1" },
      { kind: "compliance_evidence", recordId: "p1", name: "" },
      { kind: "compliance_evidence", recordId: "p1", name: "x".repeat(256) },
    ];
    for (const values of invalid) {
      expect(parseUploadRequest(params(values))).toEqual({ ok: false });
    }
  });
});

describe("isSameOrigin", () => {
  const appUrl = "https://app.zayto.example/";

  it("accepts only an exact scheme, host and port", () => {
    expect(isSameOrigin("https://app.zayto.example", appUrl)).toBe(true);
    for (const origin of [
      null,
      "",
      "null",
      "http://app.zayto.example",
      "https://app.zayto.example:8443",
      "https://evil.app.zayto.example",
      "https://app.zayto.example.evil.example",
      "https://app.zayto.example/",
    ]) {
      expect(isSameOrigin(origin, appUrl)).toBe(false);
    }
  });

  it("matches a local address with its port", () => {
    expect(isSameOrigin("http://localhost:3000", "http://localhost:3000")).toBe(
      true,
    );
    expect(isSameOrigin("http://localhost:3001", "http://localhost:3000")).toBe(
      false,
    );
  });
});

describe("request body checks", () => {
  it("accepts only a raw file body", () => {
    expect(isRawFileBody("application/octet-stream")).toBe(true);
    expect(isRawFileBody("Application/Octet-Stream; charset=binary")).toBe(
      true,
    );
    expect(isRawFileBody("multipart/form-data; boundary=x")).toBe(false);
    expect(isRawFileBody("application/pdf")).toBe(false);
    expect(isRawFileBody(null)).toBe(false);
  });

  it("refuses a declared length over the limit or not a number", () => {
    expect(isDeclaredLengthAllowed(null, 10)).toBe(true);
    expect(isDeclaredLengthAllowed("10", 10)).toBe(true);
    expect(isDeclaredLengthAllowed("11", 10)).toBe(false);
    expect(isDeclaredLengthAllowed("-1", 10)).toBe(false);
    expect(isDeclaredLengthAllowed("1e3", 10)).toBe(false);
  });

  it("reads a body up to the limit and stops past it", async () => {
    const within = await readCappedBody(streamOf(4, 6), 10);
    expect(within.ok && within.bytes.length).toBe(10);
    expect(await readCappedBody(streamOf(4, 6, 1), 10)).toEqual({ ok: false });
    expect(await readCappedBody(null, 10)).toEqual({
      ok: true,
      bytes: new Uint8Array(),
    });
  });
});

describe("downloadHeaders", () => {
  it("sends a non-cacheable attachment the browser will not run", () => {
    const headers = downloadHeaders({
      displayName: "Gas safety record.pdf",
      media: "pdf",
      byteSize: 1234,
    });
    expect(Object.fromEntries(headers.entries())).toEqual({
      "content-type": "application/pdf",
      "content-length": "1234",
      "content-disposition":
        "attachment; filename=\"Gas safety record.pdf\"; filename*=UTF-8''Gas%20safety%20record.pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-origin",
    });
  });

  it("keeps non-ASCII names safe in both filename forms", () => {
    const disposition = downloadHeaders({
      displayName: "Café (copy).png",
      media: "png",
      byteSize: 1,
    }).get("content-disposition");
    expect(disposition).toBe(
      "attachment; filename=\"Caf_ (copy).png\"; filename*=UTF-8''Caf%C3%A9%20%28copy%29.png",
    );
  });
});

describe("parseEvidenceHeader", () => {
  const NOW = new Date("2026-10-21T12:00:00Z");
  const header = (value: unknown) => encodeURIComponent(JSON.stringify(value));

  it("reads the area and typed facts", () => {
    expect(
      parseEvidenceHeader(
        header({
          area: "gas_safety",
          eventOn: "2026-10-01",
          expiresOn: "2027-09-30",
          reference: "CP12-1",
          unknown: "ignored",
        }),
        NOW,
      ),
    ).toEqual({
      ok: true,
      area: "gas_safety",
      facts: {
        eventOn: "2026-10-01",
        expiresOn: "2027-09-30",
        reference: "CP12-1",
      },
    });
  });

  it("refuses a missing, oversized, malformed or unknown-area header", () => {
    for (const value of [
      null,
      "",
      "x".repeat(12_001),
      "%7Bnot json",
      header("text"),
      header({ area: "legionella", eventOn: "2026-10-01" }),
      header({ area: "gas_safety", eventOn: 20261001 }),
    ]) {
      expect(parseEvidenceHeader(value, NOW)).toEqual({ ok: false });
    }
  });

  it("accepts a maximum-length note in a non-Latin script", () => {
    const note = "気".repeat(1000);
    const encoded = header({
      area: "gas_safety",
      eventOn: "2026-10-01",
      notes: note,
    });
    expect(encoded.length).toBeGreaterThan(4000);
    expect(parseEvidenceHeader(encoded, NOW)).toMatchObject({
      ok: true,
      facts: { notes: note },
    });
  });

  it("returns field errors when the facts are invalid", () => {
    expect(
      parseEvidenceHeader(
        header({ area: "gas_safety", eventOn: "2030-01-01" }),
        NOW,
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: { eventOn: "The date cannot be in the future." },
    });
  });
});
