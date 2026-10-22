// All monetary values in this teaching case are millions of VND, before tax.
// These are deliberately new illustrative assumptions, not results from the uploaded report.
export const caseAssumptions = { price: 1.2, variableCost: 0.24, initialCapital: 200, equipment: 36, annualDepreciation: 12 };
// The free, six-week pilot is a subset of year-one fixed costs, not an extra cost.
export const caseOperatingBudget = [
  { category: "Nội dung và kiểm duyệt", annual: 84, pilot: 5 },
  { category: "Kỹ thuật/vận hành sản phẩm", annual: 72, pilot: 4 },
  { category: "Marketing và tuyển người thử", annual: 60, pilot: 2 },
  { category: "Điều phối/hỗ trợ chung", annual: 24, pilot: 1 },
];
export const pilotBudgetTotal = caseOperatingBudget.reduce((total, item) => total + item.pilot, 0);
export const yearOneFixedCashCosts = caseOperatingBudget.reduce((total, item) => total + item.annual, 0);
const round = (n: number) => Math.round(n * 100) / 100;
export function calculateCase() {
  let cash = caseAssumptions.initialCapital, retained = 0;
  return [200, 500, 900].map((units, index) => {
    const fixedCashCosts = [yearOneFixedCashCosts, 360, 480][index];
    const revenue = round(units * caseAssumptions.price), variableCosts = round(units * caseAssumptions.variableCost);
    const operatingCash = round(revenue - variableCosts - fixedCashCosts);
    const depreciation = caseAssumptions.annualDepreciation, profitBeforeTax = round(operatingCash - depreciation);
    const investment = index === 0 ? caseAssumptions.equipment : 0;
    const openingCash = cash;
    cash = round(cash + operatingCash - investment);
    retained = round(retained + profitBeforeTax);
    const equipmentNet = caseAssumptions.equipment - depreciation * (index + 1);
    return { year: index + 1, units, revenue, variableCosts, contribution: round(revenue - variableCosts), fixedCashCosts, depreciation, profitBeforeTax, operatingCash, investment, openingCash, closingCash: cash, netCash: round(operatingCash - investment), equipmentNet, assets: round(cash + equipmentNet), liabilities: 0, capital: caseAssumptions.initialCapital, retained, equity: round(caseAssumptions.initialCapital + retained) };
  });
}
export function breakEvenUnits(price: number, variableCost: number, fixedCost: number): number | null {
  if (![price, variableCost, fixedCost].every(Number.isFinite) || price <= 0 || variableCost < 0 || fixedCost < 0 || price <= variableCost) return null;
  return Math.ceil(fixedCost / (price - variableCost));
}
export const financialCase = calculateCase();
