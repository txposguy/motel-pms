export type TaxRuleInput = {
  id: string;
  name: string;
  ratePercent: number;
  appliesTo: "room_charge" | "incidental";
};

export type TaxLineResult = {
  taxRuleId: string;
  description: string;
  amount: number;
};

// Pure calculation only — the caller is responsible for filtering to
// active, currently-effective tax rules before calling this. Each rule is
// rounded to the cent independently, matching how real filing-jurisdiction
// tax lines are stacked and reported separately (state HOT, city HOT,
// county HOT...), not blended into one combined rate.
export function calculateTax(
  baseAmount: number,
  taxRules: TaxRuleInput[],
  appliesTo: "room_charge" | "incidental"
): TaxLineResult[] {
  return taxRules
    .filter((rule) => rule.appliesTo === appliesTo)
    .map((rule) => ({
      taxRuleId: rule.id,
      description: `${rule.name} (${rule.ratePercent}%)`,
      amount: Math.round(baseAmount * (rule.ratePercent / 100) * 100) / 100,
    }));
}
