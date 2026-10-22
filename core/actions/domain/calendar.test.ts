import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  calendarRange,
  parseCalendarDate,
  parseCalendarScope,
  parseCalendarView,
} from "./calendar";

describe("staff calendar navigation", () => {
  it("uses checked defaults for untrusted URL values", () => {
    expect(parseCalendarView("agenda")).toBe("week");
    expect(parseCalendarScope("everyone")).toBe("mine");
    expect(parseCalendarDate("not-a-date", "2026-10-22")).toBe("2026-10-22");
  });

  it("builds a Monday-to-Sunday week in UK time", () => {
    const range = calendarRange("2026-10-22", "week");

    expect(range.from).toBe("2026-10-19");
    expect(range.to).toBe("2026-10-25");
    expect(range.start.toISOString()).toBe("2026-10-18T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("caps a month grid at six weeks", () => {
    const range = calendarRange("2026-10-22", "month");

    expect(range.from).toBe("2026-09-28");
    expect(range.to).toBe("2026-11-08");
  });

  it("moves calendar dates without local timezone drift", () => {
    expect(addCalendarDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addCalendarDays("2026-10-25", 1)).toBe("2026-10-26");
  });
});
