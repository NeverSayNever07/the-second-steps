import type { RentPeriodCode } from "./instruction";

/** Five weeks of rent, rounded down so the amount never exceeds the cap. */
export function calculateFiveWeekDepositPence(
  rentPence: number,
  period: RentPeriodCode,
): number {
  const annualRentPence = period === "week" ? rentPence * 52 : rentPence * 12;
  return Math.floor((annualRentPence * 5) / 52);
}
