import type {
  CouncilTaxBandCode,
  FloorAreaUnitCode,
  FurnishedStatusCode,
  PropertyFeatureCode,
  PropertyTypeCode,
  ValidPropertyDetails,
} from "@/core/properties/domain/property";
import type {
  DepositOfferingCode,
  RentPeriodCode,
} from "@/core/instructions/domain/instruction";

// What a listing may copy from its sources. Both builders pick fields by
// name, never by spreading, so nothing new on a property or instruction can
// reach an advert without being added here on purpose. Landlord-private data
// (fees, charges, the agreement, the ownership check, landlords) and the
// property's internal summary are never copied.

export type ListingPropertyFacts = {
  addressBuilding: string | null;
  addressStreet: string;
  addressLocality: string | null;
  townCity: string;
  county: string | null;
  postcode: string;
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
};

export function listingFactsFromProperty(
  property: ValidPropertyDetails,
): ListingPropertyFacts {
  return {
    addressBuilding: property.addressBuilding,
    addressStreet: property.addressStreet,
    addressLocality: property.addressLocality,
    townCity: property.townCity,
    county: property.county,
    postcode: property.postcode,
    propertyType: property.propertyType,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    receptionRooms: property.receptionRooms,
    floorArea: property.floorArea,
    floorAreaUnit: property.floorAreaUnit,
    furnishedStatus: property.furnishedStatus,
    features: [...property.features].sort(),
    parkingNotes: property.parkingNotes,
    outdoorSpaceNotes: property.outdoorSpaceNotes,
    councilTaxBand: property.councilTaxBand,
  };
}

/** The rent and deposit a listing takes from the instruction's agreed terms. */
export type ListingRentSource = {
  sourceTermsVersionId: string;
  advertisedRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  depositOffering: DepositOfferingCode | null;
  depositPence: number | null;
  holdingDepositPence: number | null;
};

export function listingRentFromTerms(terms: {
  id: string;
  askingRentPence: number | null;
  rentPeriod: RentPeriodCode | null;
  depositOffering: DepositOfferingCode | null;
  depositPence: number | null;
  holdingDepositPence: number | null;
}): ListingRentSource {
  return {
    sourceTermsVersionId: terms.id,
    advertisedRentPence: terms.askingRentPence,
    rentPeriod: terms.rentPeriod,
    depositOffering: terms.depositOffering,
    depositPence: terms.depositPence,
    holdingDepositPence: terms.holdingDepositPence,
  };
}

/** What a version records of its sources when it is saved. */
export type SourceSnapshot = {
  rent: ListingRentSource;
  facts: ListingPropertyFacts;
};
