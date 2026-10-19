import { describe, expect, it } from "vitest";
import { fullNameMatch } from "./contact-search";

describe("fullNameMatch", () => {
  it("adds nothing for a one-word search", () => {
    expect(fullNameMatch("Larsen")).toEqual([]);
    expect(fullNameMatch("   ")).toEqual([]);
  });

  it("requires every word in the first or last name", () => {
    expect(fullNameMatch(" Ingrid   Larsen ")).toEqual([
      {
        AND: ["Ingrid", "Larsen"].map((word) => ({
          OR: [
            { firstName: { contains: word, mode: "insensitive" } },
            { lastName: { contains: word, mode: "insensitive" } },
          ],
        })),
      },
    ]);
  });

  it("caps the number of words searched", () => {
    const [match] = fullNameMatch("a b c d e f g");
    expect(match?.AND).toHaveLength(5);
  });
});
