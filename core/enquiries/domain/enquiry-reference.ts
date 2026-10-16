import { randomBytes } from "node:crypto";

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createEnquiryReference() {
  const suffix = Array.from(
    randomBytes(8),
    (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length],
  ).join("");
  return `ENQ-${suffix}`;
}
