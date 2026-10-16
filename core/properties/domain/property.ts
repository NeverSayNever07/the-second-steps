export const PROPERTY_LIMITS = {
  addressBuilding: 160,
  addressStreet: 160,
  addressLocality: 100,
  townCity: 100,
  county: 100,
  rooms: 50,
  floorArea: 100000,
  notes: 500,
  generalNotes: 2000,
  reason: 500,
} as const;

export const PROPERTY_TYPES = [
  "detached",
  "semi_detached",
  "terraced",
  "bungalow",
  "flat",
  "maisonette",
  "room",
  "other",
] as const;
export type PropertyTypeCode = (typeof PROPERTY_TYPES)[number];

export const FURNISHED_STATUSES = [
  "furnished",
  "part_furnished",
  "unfurnished",
  "flexible",
] as const;
export type FurnishedStatusCode = (typeof FURNISHED_STATUSES)[number];

export const FLOOR_AREA_UNITS = ["sq_ft", "sq_m"] as const;
export type FloorAreaUnitCode = (typeof FLOOR_AREA_UNITS)[number];

export const COUNCIL_TAX_BANDS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
] as const;
export type CouncilTaxBandCode = (typeof COUNCIL_TAX_BANDS)[number];

export const PROPERTY_FEATURE_GROUPS = [
  {
    label: "Outside space",
    features: [
      "private_garden",
      "communal_garden",
      "balcony",
      "terrace",
      "patio",
    ],
  },
  {
    label: "Parking",
    features: [
      "off_street_parking",
      "allocated_parking",
      "garage",
      "on_street_parking",
      "permit_parking",
      "ev_charging",
    ],
  },
  {
    label: "Building",
    features: ["lift", "concierge", "bike_storage", "wheelchair_accessible"],
  },
  {
    label: "Heating",
    features: ["gas_central_heating", "electric_heating", "underfloor_heating"],
  },
  {
    label: "Interior",
    features: [
      "en_suite",
      "utility_room",
      "dishwasher",
      "washing_machine",
      "fireplace",
    ],
  },
] as const;
export type PropertyFeatureCode =
  (typeof PROPERTY_FEATURE_GROUPS)[number]["features"][number];

const FEATURE_CODES: ReadonlySet<string> = new Set(
  PROPERTY_FEATURE_GROUPS.flatMap(({ features }) => features),
);

/** Returns the postcode as "SW1A 1AA", or null if it is not a UK postcode. */
export function normalizePropertyPostcode(value: string) {
  const compact = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

function comparable(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A hidden key used only to spot duplicate addresses: building, street and
 * postcode, lower-cased with punctuation and extra spacing removed.
 */
export function buildNormalizedAddressKey(input: {
  building: string | null;
  street: string;
  postcode: string;
}) {
  const postcode = comparable(input.postcode).replace(/ /g, "");
  return [comparable(input.building), comparable(input.street), postcode].join(
    "|",
  );
}

/**
 * "strong": same building, street and postcode. "possible": same street and
 * postcode but a different or missing building (for example another flat).
 */
export function classifyAddressDuplicate(keyA: string, keyB: string) {
  const [buildingA, streetA, postcodeA] = keyA.split("|");
  const [buildingB, streetB, postcodeB] = keyB.split("|");
  if (
    !streetA ||
    !postcodeA ||
    streetA !== streetB ||
    postcodeA !== postcodeB
  ) {
    return "none" as const;
  }
  return buildingA === buildingB ? ("strong" as const) : ("possible" as const);
}

export type PropertyDetailsInput = {
  addressBuilding: string;
  addressStreet: string;
  addressLocality: string;
  townCity: string;
  county: string;
  postcode: string;
  propertyType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  receptionRooms: number | null;
  floorArea: number | null;
  floorAreaUnit: string | null;
  furnishedStatus: string | null;
  features: readonly string[];
  parkingNotes: string;
  outdoorSpaceNotes: string;
  councilTaxBand: string | null;
  generalNotes: string;
};

export type ValidPropertyDetails = {
  addressBuilding: string | null;
  addressStreet: string;
  addressLocality: string | null;
  townCity: string;
  county: string | null;
  postcode: string;
  normalizedAddressKey: string;
  propertyType: PropertyTypeCode;
  bedrooms: number | null;
  bathrooms: number | null;
  receptionRooms: number | null;
  floorArea: number | null;
  floorAreaUnit: FloorAreaUnitCode | null;
  furnishedStatus: FurnishedStatusCode | null;
  features: PropertyFeatureCode[];
  parkingNotes: string | null;
  outdoorSpaceNotes: string | null;
  councilTaxBand: CouncilTaxBandCode | null;
  generalNotes: string | null;
};

export type PropertyField = keyof PropertyDetailsInput;

function optional(value: string) {
  return value.trim() || null;
}

function oneOf<T extends string>(
  options: readonly T[],
  value: string | null,
): T | null | undefined {
  if (value === null || value === "") return null;
  return options.find((option) => option === value);
}

function wholeNumber(value: number | null, max: number, min = 0) {
  if (value === null) return null;
  return Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

export function validatePropertyDetails(input: PropertyDetailsInput) {
  const errors: Partial<Record<PropertyField, string>> = {};

  const addressBuilding = optional(input.addressBuilding);
  const addressStreet = input.addressStreet.trim();
  const addressLocality = optional(input.addressLocality);
  const townCity = input.townCity.trim();
  const county = optional(input.county);
  const postcode = normalizePropertyPostcode(input.postcode);

  const tooLong = (value: string | null, max: number): value is string =>
    value !== null && value.length > max;
  if (tooLong(addressBuilding, PROPERTY_LIMITS.addressBuilding)) {
    errors.addressBuilding = `Use ${PROPERTY_LIMITS.addressBuilding} characters or fewer.`;
  }
  if (!addressStreet) errors.addressStreet = "Enter the street.";
  else if (addressStreet.length > PROPERTY_LIMITS.addressStreet) {
    errors.addressStreet = `Use ${PROPERTY_LIMITS.addressStreet} characters or fewer.`;
  }
  if (tooLong(addressLocality, PROPERTY_LIMITS.addressLocality)) {
    errors.addressLocality = `Use ${PROPERTY_LIMITS.addressLocality} characters or fewer.`;
  }
  if (!townCity) errors.townCity = "Enter the town or city.";
  else if (townCity.length > PROPERTY_LIMITS.townCity) {
    errors.townCity = `Use ${PROPERTY_LIMITS.townCity} characters or fewer.`;
  }
  if (tooLong(county, PROPERTY_LIMITS.county)) {
    errors.county = `Use ${PROPERTY_LIMITS.county} characters or fewer.`;
  }
  if (!input.postcode.trim()) errors.postcode = "Enter the postcode.";
  else if (!postcode) errors.postcode = "Enter a valid UK postcode.";

  const propertyType = oneOf(PROPERTY_TYPES, input.propertyType);
  if (!propertyType) errors.propertyType = "Choose the property type.";

  const bedrooms = wholeNumber(input.bedrooms, PROPERTY_LIMITS.rooms);
  const bathrooms = wholeNumber(input.bathrooms, PROPERTY_LIMITS.rooms);
  const receptionRooms = wholeNumber(
    input.receptionRooms,
    PROPERTY_LIMITS.rooms,
  );
  if (bedrooms === undefined)
    errors.bedrooms = "Enter a whole number, 0 to 50.";
  if (bathrooms === undefined) {
    errors.bathrooms = "Enter a whole number, 0 to 50.";
  }
  if (receptionRooms === undefined) {
    errors.receptionRooms = "Enter a whole number, 0 to 50.";
  }

  const floorArea = wholeNumber(input.floorArea, PROPERTY_LIMITS.floorArea, 1);
  const floorAreaUnit = oneOf(FLOOR_AREA_UNITS, input.floorAreaUnit);
  if (floorArea === undefined) errors.floorArea = "Enter a whole number.";
  if (floorAreaUnit === undefined) errors.floorAreaUnit = "Choose a unit.";
  else if ((floorArea ?? null) !== null && floorAreaUnit === null) {
    errors.floorAreaUnit = "Choose a unit.";
  } else if (floorArea === null && floorAreaUnit !== null) {
    errors.floorArea = "Enter the floor area or clear the unit.";
  }

  const furnishedStatus = oneOf(FURNISHED_STATUSES, input.furnishedStatus);
  if (furnishedStatus === undefined) {
    errors.furnishedStatus = "Choose a furnished status.";
  }
  const councilTaxBand = oneOf(COUNCIL_TAX_BANDS, input.councilTaxBand);
  if (councilTaxBand === undefined) {
    errors.councilTaxBand = "Choose a council tax band.";
  }

  const features = [...new Set(input.features)];
  if (features.some((feature) => !FEATURE_CODES.has(feature))) {
    errors.features = "Choose features from the list.";
  }

  const parkingNotes = optional(input.parkingNotes);
  const outdoorSpaceNotes = optional(input.outdoorSpaceNotes);
  const generalNotes = optional(input.generalNotes);
  if (tooLong(parkingNotes, PROPERTY_LIMITS.notes)) {
    errors.parkingNotes = `Use ${PROPERTY_LIMITS.notes} characters or fewer.`;
  }
  if (tooLong(outdoorSpaceNotes, PROPERTY_LIMITS.notes)) {
    errors.outdoorSpaceNotes = `Use ${PROPERTY_LIMITS.notes} characters or fewer.`;
  }
  if (tooLong(generalNotes, PROPERTY_LIMITS.generalNotes)) {
    errors.generalNotes = `Use ${PROPERTY_LIMITS.generalNotes} characters or fewer.`;
  }

  if (
    Object.keys(errors).length > 0 ||
    !postcode ||
    !propertyType ||
    bedrooms === undefined ||
    bathrooms === undefined ||
    receptionRooms === undefined ||
    floorArea === undefined ||
    floorAreaUnit === undefined ||
    furnishedStatus === undefined ||
    councilTaxBand === undefined
  ) {
    return { ok: false, errors } as const;
  }

  const data: ValidPropertyDetails = {
    addressBuilding,
    addressStreet,
    addressLocality,
    townCity,
    county,
    postcode,
    normalizedAddressKey: buildNormalizedAddressKey({
      building: addressBuilding,
      street: addressStreet,
      postcode,
    }),
    propertyType,
    bedrooms,
    bathrooms,
    receptionRooms,
    floorArea,
    floorAreaUnit,
    furnishedStatus,
    features: features as PropertyFeatureCode[],
    parkingNotes,
    outdoorSpaceNotes,
    councilTaxBand,
    generalNotes,
  };
  return { ok: true, data } as const;
}

/** A reason is required when moving a property or ending an ownership. */
export function validatePropertyReason(value: string) {
  const reason = value.trim();
  if (!reason) return { ok: false, error: "Give a reason." } as const;
  if (reason.length > PROPERTY_LIMITS.reason) {
    return {
      ok: false,
      error: `Use ${PROPERTY_LIMITS.reason} characters or fewer.`,
    } as const;
  }
  return { ok: true, reason } as const;
}

/** Parses a "YYYY-MM-DD" date; blank means unknown. */
export function parseOwnershipDate(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return { ok: true, date: null } as const;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { ok: false } as const;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text ||
    Number(match[1]) < 1900
  ) {
    return { ok: false } as const;
  }
  return { ok: true, date } as const;
}

export function ownershipDatesAreOrdered(
  startedOn: Date | null,
  endedOn: Date | null,
) {
  return !startedOn || !endedOn || endedOn.getTime() >= startedOn.getTime();
}

/** At most one lead, and the lead must be one of the listed owners. */
export function validateOwnerSelection(
  owners: readonly { contactId: string; isLead: boolean }[],
) {
  const contactIds = owners.map(({ contactId }) => contactId);
  if (new Set(contactIds).size !== contactIds.length) {
    return { ok: false, reason: "duplicate_owner" } as const;
  }
  if (owners.filter(({ isLead }) => isLead).length > 1) {
    return { ok: false, reason: "multiple_leads" } as const;
  }
  return { ok: true } as const;
}
