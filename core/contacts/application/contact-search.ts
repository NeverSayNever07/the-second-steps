import type { Prisma } from "@/core/db/generated/client";

const MAX_NAME_WORDS = 5;

/**
 * Lets a person be found by their full name ("Ingrid Larsen"): every word
 * must appear in the first or last name. Returns nothing for one-word
 * searches, which the single-field matches already cover.
 */
export function fullNameMatch(query: string): Prisma.ContactWhereInput[] {
  const words = query.split(/\s+/).filter(Boolean).slice(0, MAX_NAME_WORDS);
  if (words.length < 2) {
    return [];
  }
  return [
    {
      AND: words.map((word) => ({
        OR: [
          { firstName: { contains: word, mode: "insensitive" } },
          { lastName: { contains: word, mode: "insensitive" } },
        ],
      })),
    },
  ];
}
