import { describe, expect, it } from "vitest";
import {
  deriveLettingStatus,
  LETTING_STATUS_DESCRIPTIONS,
  LETTING_STATUS_LABELS,
  LETTING_STATUSES,
} from "./letting-status";

const ready = { journeyStage: "ready_to_market" } as const;

describe("a property's letting status", () => {
  it("is Not instructed with no instruction, and Ended once one has finished", () => {
    expect(
      deriveLettingStatus({
        currentInstruction: null,
        hasEndedInstruction: false,
        listingState: null,
      }),
    ).toBe("not_instructed");
    expect(
      deriveLettingStatus({
        currentInstruction: null,
        hasEndedInstruction: true,
        listingState: null,
      }),
    ).toBe("ended");
  });

  it("follows the current instruction and its current listing", () => {
    const status = (
      currentInstruction: Parameters<
        typeof deriveLettingStatus
      >[0]["currentInstruction"],
      listingState: Parameters<typeof deriveLettingStatus>[0]["listingState"],
    ) =>
      deriveLettingStatus({
        currentInstruction,
        hasEndedInstruction: true,
        listingState,
      });
    expect(status({ journeyStage: "onboarding" }, null)).toBe("onboarding");
    expect(status(ready, null)).toBe("ready_to_market");
    expect(status(ready, "draft")).toBe("listing_in_preparation");
    expect(status(ready, "content_ready")).toBe("listing_in_preparation");
    expect(status(ready, "ready_to_advertise")).toBe("ready_to_advertise");
  });

  it("does not claim a listing exists when the viewer cannot read listings", () => {
    expect(
      deriveLettingStatus({
        currentInstruction: ready,
        hasEndedInstruction: false,
        listingState: undefined,
      }),
    ).toBe("ready_to_market");
  });

  it("never says a property is advertised, published or live", () => {
    for (const code of LETTING_STATUSES) {
      expect(LETTING_STATUS_LABELS[code], code).not.toMatch(
        /published|live|advertised on/i,
      );
      if (code !== "ready_to_advertise") {
        expect(LETTING_STATUS_DESCRIPTIONS[code], code).not.toMatch(
          /published|live|advertised on/i,
        );
      }
    }
    expect(LETTING_STATUS_DESCRIPTIONS.ready_to_advertise).toContain(
      "Nothing has been published",
    );
  });
});
