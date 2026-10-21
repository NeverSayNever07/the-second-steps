import type { ListingPropertyFacts, SourceSnapshot } from "./listing-source";

// Source drift: the instruction's agreed terms or the property's facts have
// changed since a version was saved. Drift is shown, never silently applied,
// and blocks a new confirmation until a new version is saved after looking at
// the differences.

export type DriftField =
  | "rent"
  | "rent_period"
  | "deposit_offering"
  | "deposit"
  | "holding_deposit"
  | "address"
  | "property_type"
  | "rooms"
  | "floor_area"
  | "furnishing"
  | "council_tax"
  | "parking"
  | "outdoor_space"
  | "features";

export const DRIFT_LABELS: Record<DriftField, string> = {
  rent: "Agreed rent",
  rent_period: "Rent period",
  deposit_offering: "Deposit offered",
  deposit: "Deposit amount",
  holding_deposit: "Holding deposit",
  address: "Address",
  property_type: "Property type",
  rooms: "Bedrooms, bathrooms or reception rooms",
  floor_area: "Floor area",
  furnishing: "Furnishing",
  council_tax: "Council tax band",
  parking: "Parking notes",
  outdoor_space: "Outdoor space notes",
  features: "Features",
};

export type DriftItem = {
  field: DriftField;
  label: string;
  /** What the saved version was based on, and what the source says now. */
  before: string;
  after: string;
};

const text = (value: string | number | null) =>
  value === null || value === "" ? "Not recorded" : String(value);

const address = (facts: ListingPropertyFacts) =>
  [
    facts.addressBuilding,
    facts.addressStreet,
    facts.addressLocality,
    facts.townCity,
    facts.county,
    facts.postcode,
  ]
    .filter(Boolean)
    .join(", ");

const rooms = (facts: ListingPropertyFacts) =>
  `${text(facts.bedrooms)} bed, ${text(facts.bathrooms)} bath, ${text(facts.receptionRooms)} reception`;

const floorArea = (facts: ListingPropertyFacts) =>
  facts.floorArea === null
    ? "Not recorded"
    : `${facts.floorArea} ${facts.floorAreaUnit ?? ""}`.trim();

/** The differences between what a version was based on and the sources now. */
export function detectDrift(
  saved: SourceSnapshot,
  live: SourceSnapshot,
): DriftItem[] {
  const items: DriftItem[] = [];
  const compare = (
    field: DriftField,
    before: string | number | null,
    after: string | number | null,
  ) => {
    if (before !== after) {
      items.push({
        field,
        label: DRIFT_LABELS[field],
        before: text(before),
        after: text(after),
      });
    }
  };

  compare(
    "rent",
    saved.rent.advertisedRentPence,
    live.rent.advertisedRentPence,
  );
  compare("rent_period", saved.rent.rentPeriod, live.rent.rentPeriod);
  compare(
    "deposit_offering",
    saved.rent.depositOffering,
    live.rent.depositOffering,
  );
  compare("deposit", saved.rent.depositPence, live.rent.depositPence);
  compare(
    "holding_deposit",
    saved.rent.holdingDepositPence,
    live.rent.holdingDepositPence,
  );

  const a = saved.facts;
  const b = live.facts;
  compare("address", address(a), address(b));
  compare("property_type", a.propertyType, b.propertyType);
  compare("rooms", rooms(a), rooms(b));
  compare("floor_area", floorArea(a), floorArea(b));
  compare("furnishing", a.furnishedStatus, b.furnishedStatus);
  compare("council_tax", a.councilTaxBand, b.councilTaxBand);
  compare("parking", a.parkingNotes, b.parkingNotes);
  compare("outdoor_space", a.outdoorSpaceNotes, b.outdoorSpaceNotes);
  compare(
    "features",
    [...a.features].sort().join(", "),
    [...b.features].sort().join(", "),
  );
  return items;
}
