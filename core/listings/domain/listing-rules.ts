// The numbers the listing rules depend on, in one place so a change is one
// edit. A starting rule for the fictional build; the real minimums need
// legal and portal review (.cursor/plans/marketing-m0-design.md).

/** The media a listing needs before Ready to advertise, and the most it holds. */
export const MEDIA_RULES = {
  minPhotos: 5,
  minFloorplans: 1,
  maxPhotos: 30,
  maxFloorplans: 3,
} as const;

/** Longest text accepted in each advert field. */
export const LISTING_LIMITS = {
  headline: 120,
  summary: 400,
  description: 4000,
  highlight: 120,
  highlights: 8,
  availabilityNote: 300,
  depositNote: 500,
  materialInformation: 4000,
  caption: 200,
  reason: 500,
} as const;
