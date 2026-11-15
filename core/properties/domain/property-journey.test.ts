import { describe, expect, it } from "vitest";
import {
  derivePropertyJourney,
  type PropertyJourneyInput,
} from "./property-journey";

const checklist = [
  { label: "A lead staff member", met: true },
  { label: "A signed agreement", met: false },
];
const onboarding = {
  id: "ins",
  journeyStage: "onboarding" as const,
  instructedOn: "2026-10-17",
  checklist,
  checklistComplete: false,
};
const ready = {
  ...onboarding,
  journeyStage: "ready_to_market" as const,
  checklist: checklist.map((item) => ({ ...item, met: true })),
  checklistComplete: true,
};

function journey(input: Partial<PropertyJourneyInput>) {
  return derivePropertyJourney({
    leads: [],
    instruction: null,
    listing: null,
    archived: false,
    ...input,
  });
}

const states = (result: ReturnType<typeof journey>) =>
  result.steps.map((step) => step.state[0]).join("");

describe("where a property is on its journey", () => {
  it("has nothing current and no next step without a lead or an instruction", () => {
    const result = journey({});
    expect(result.current).toBeNull();
    expect(states(result)).toBe("aaaaaaa");
    expect(result.next).toBeNull();
  });

  it("follows an open lead through to starting the instruction", () => {
    const fresh = journey({ leads: [{ id: "l1", stage: "new_enquiry" }] });
    expect(fresh.current).toBe("lead");
    expect(fresh.next).toMatchObject({
      title: "Book the appraisal",
      target: { kind: "lead", leadId: "l1" },
    });

    const booked = journey({
      leads: [{ id: "l1", stage: "appraisal_booked" }],
    });
    expect(states(booked)).toBe("dcaaaaa");
    expect(booked.next?.title).toBe("Record the appraisal outcome");

    const completed = journey({
      leads: [{ id: "l1", stage: "appraisal_completed" }],
    });
    expect(states(completed)).toBe("ddcaaaa");
    expect(completed.steps[2].caption).toBe("Not started");
    expect(completed.next?.title).toBe("Start the instruction");
  });

  it("uses the open lead that has got furthest and ignores closed ones", () => {
    const result = journey({
      leads: [
        { id: "lost", stage: "lost" },
        { id: "new", stage: "new_enquiry" },
        { id: "far", stage: "appraisal_booked" },
      ],
    });
    expect(result.current).toBe("appraisal");
    expect(result.next?.target).toEqual({ kind: "lead", leadId: "far" });
    expect(journey({ leads: [{ id: "x", stage: "lost" }] }).current).toBeNull();
  });

  it("shows onboarding with its checklist, then Ready to market", () => {
    const result = journey({ instruction: onboarding });
    expect(states(result)).toBe("ddcaaaa");
    expect(result.steps[2]).toMatchObject({
      caption: "Onboarding",
      detail: "Onboarding: 1 of 2 checklist items are in place.",
    });
    expect(result.next).toMatchObject({
      title: "Finish onboarding",
      target: { kind: "instruction", instructionId: "ins" },
      checklist,
    });
    expect(
      journey({
        instruction: { ...onboarding, checklistComplete: true },
      }).next?.title,
    ).toBe("Mark it Ready to market");
  });

  it("moves through the listing's states to enquiries", () => {
    const none = journey({ instruction: ready, listing: null });
    expect(states(none)).toBe("dddcaaa");
    expect(none.steps[2].caption).toBe("17 Oct");
    expect(none.steps[3].caption).toBe("Not started");
    expect(none.next).toMatchObject({
      title: "Prepare the listing",
      target: { kind: "instruction", instructionId: "ins" },
    });

    const draft = journey({
      instruction: ready,
      listing: { id: "lst", state: "draft" },
    });
    expect(draft.steps[3].caption).toBe("Draft");
    expect(draft.next).toMatchObject({
      title: "Finish the advert",
      target: { kind: "listing", listingId: "lst" },
    });

    const content = journey({
      instruction: ready,
      listing: { id: "lst", state: "content_ready" },
    });
    expect(content.current).toBe("listing");
    expect(content.next?.target).toEqual({
      kind: "listing",
      listingId: "lst",
      tab: "readiness",
    });

    const advertise = journey({
      instruction: ready,
      listing: { id: "lst", state: "ready_to_advertise" },
    });
    expect(states(advertise)).toBe("ddddcaa");
    expect(advertise.next?.target).toEqual({
      kind: "listing",
      listingId: "lst",
      tab: "enquiries",
    });
  });

  it("never marks Viewings or Let as reached, and says they are not built", () => {
    const result = journey({
      instruction: ready,
      listing: { id: "lst", state: "ready_to_advertise" },
    });
    for (const step of result.steps.slice(5)) {
      expect(step.state).toBe("ahead");
      expect(step.detail).toBe("Not built in Zayto yet.");
    }
  });

  it("does not guess the next step when the viewer cannot read listings or leads", () => {
    const hidden = journey({ instruction: ready, listing: undefined });
    expect(hidden.current).toBe("listing");
    expect(hidden.steps[3].caption).toBe("");
    expect(hidden.next).toBeNull();
    // Without access to leads, an instruction still shows the earlier steps done.
    expect(states(journey({ leads: null, instruction: onboarding }))).toBe(
      "ddcaaaa",
    );
    expect(journey({ leads: null }).next).toBeNull();
  });

  it("treats a withdrawn instruction as none, and an archived property as stopped", () => {
    const withdrawn = journey({
      instruction: { ...ready, journeyStage: "withdrawn" },
      listing: { id: "lst", state: "draft" },
    });
    expect(withdrawn.current).toBeNull();
    expect(withdrawn.next).toBeNull();
    const archived = journey({ instruction: onboarding, archived: true });
    expect(archived.current).toBeNull();
    expect(archived.next).toBeNull();
  });
});
