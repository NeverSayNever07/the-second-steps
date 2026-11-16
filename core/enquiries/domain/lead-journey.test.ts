import { describe, expect, it } from "vitest";
import { deriveLeadJourney } from "./lead-journey";

const states = (stage: Parameters<typeof deriveLeadJourney>[0]) =>
  deriveLeadJourney(stage)?.map(({ state }) => state);

describe("deriveLeadJourney", () => {
  it("puts a new lead on the Lead step", () => {
    expect(states("new_enquiry")).toEqual(["current", "ahead", "ahead"]);
  });

  it("puts a lead with a booked appraisal on the Appraisal step", () => {
    expect(states("appraisal_booked")).toEqual(["done", "current", "ahead"]);
  });

  it("shows the instruction as not started once the appraisal is complete", () => {
    const steps = deriveLeadJourney("appraisal_completed");
    expect(steps?.map(({ state }) => state)).toEqual([
      "done",
      "done",
      "current",
    ]);
    expect(steps?.[2]?.caption).toBe("Not started");
  });

  it("shows every step done for a won lead", () => {
    const steps = deriveLeadJourney("won");
    expect(steps?.map(({ state }) => state)).toEqual(["done", "done", "done"]);
    expect(steps?.[2]?.caption).toBe("Won");
  });

  it("has no journey for a lost or postponed lead", () => {
    expect(deriveLeadJourney("lost")).toBeNull();
    expect(deriveLeadJourney("postponed")).toBeNull();
  });
});
