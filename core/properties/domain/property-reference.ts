import { randomBytes } from "node:crypto";

// Matches the database check on properties.reference.
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createPropertyReference() {
  const suffix = Array.from(
    randomBytes(8),
    (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length],
  ).join("");
  return `PRP-${suffix}`;
}
