import { describe, expect, it } from "vitest";
import { calculateFiveWeekDepositPence } from "./deposit";

describe("calculateFiveWeekDepositPence", () => {
  it("calculates five weeks from a monthly rent", () => {
    expect(calculateFiveWeekDepositPence(150_000, "month")).toBe(173_076);
  });

  it("calculates five weeks from a weekly rent", () => {
    expect(calculateFiveWeekDepositPence(350_00, "week")).toBe(175_000);
  });
});
