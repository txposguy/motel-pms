export type RatePlanUnit = "hourly" | "nightly" | "weekly";

function setTimeOfDay(date: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function computeExpectedCheckOut(
  ratePlan: { unit: RatePlanUnit; durationUnits: number },
  checkedInAt: Date,
  propertyCheckOutTime: string
): Date {
  if (ratePlan.unit === "hourly") {
    return new Date(checkedInAt.getTime() + ratePlan.durationUnits * 60 * 60 * 1000);
  }
  const days = ratePlan.unit === "weekly" ? ratePlan.durationUnits : 1;
  const result = new Date(checkedInAt);
  result.setDate(result.getDate() + days);
  return setTimeOfDay(result, propertyCheckOutTime);
}

export function formatMoney(amount: number | string): string {
  return `$${Number(amount).toFixed(2)}`;
}

export function calculateAge(dob: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function isExpired(date: Date, asOf: Date = new Date()): boolean {
  return date.getTime() < asOf.getTime();
}
