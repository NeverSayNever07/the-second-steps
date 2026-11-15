// The views of the Landlord leads list (ADR-039). The list and the counts on
// its tabs are built from the same definition, so they cannot disagree.

export const ENQUIRY_VIEWS = [
  "attention",
  "mine",
  "open",
  "won",
  "closed",
] as const;
export type EnquiryView = (typeof ENQUIRY_VIEWS)[number];

/** What a person lands on: the leads that need something done. */
export const DEFAULT_ENQUIRY_VIEW: EnquiryView = "attention";

export const ENQUIRY_VIEW_LABELS: Record<EnquiryView, string> = {
  attention: "Needs action",
  mine: "Mine",
  open: "All open",
  won: "Won",
  closed: "Lost or postponed",
};

export const ENQUIRY_VIEW_EMPTY: Record<EnquiryView, string> = {
  attention:
    "Nothing needs action. Every open lead has a next action that is not overdue.",
  mine: "You are not looking after any open leads.",
  open: "There are no open landlord leads.",
  won: "No leads have been won yet.",
  closed: "No leads are lost or postponed.",
};

export function isEnquiryView(value: unknown): value is EnquiryView {
  return (
    typeof value === "string" &&
    (ENQUIRY_VIEWS as readonly string[]).includes(value)
  );
}

/** A view from the web address; anything unknown is the default. */
export function parseEnquiryView(value: unknown): EnquiryView {
  return isEnquiryView(value) ? value : DEFAULT_ENQUIRY_VIEW;
}
