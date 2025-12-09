export type WithdrawalMode = "none" | "percentOfProfit" | "fixedDollar";

export interface MonthlyPnlPoint {
  month: string; // YYYY-MM
  pnl: number; // monthly P/L for the portfolio at base capital sizing
}

export interface WithdrawalPoint {
  month: string;
  pnl: number; // scaled monthly P/L applied to current equity
  withdrawal: number; // amount skimmed this month
  equity: number; // ending equity after withdrawal/reset
  equityBase: number; // what equity would be if NO withdrawals ever happened
}

export interface WithdrawalResult {
  points: WithdrawalPoint[];
  totalWithdrawn: number;
  finalEquity: number;
  cagrPct: number;
  maxDdPct: number;
}

function computeCagrPct(
  startingBalance: number,
  finalEquity: number,
  months: number
): number {
  const years = months / 12;
  if (years <= 0 || startingBalance <= 0 || finalEquity <= 0) return 0;
  const cagr = Math.pow(finalEquity / startingBalance, 1 / years) - 1;
  return cagr * 100;
}

export function runWithdrawalSimulationV2(params: {
  startingBalance: number;
  baseCapital?: number; // optional; if omitted we assume monthly pnl already matches current equity basis
  mode: WithdrawalMode;
  percent?: number;
  fixedDollar?: number;
  withdrawOnlyProfitableMonths: boolean;
  resetToStartingBalance?: boolean;
  months: MonthlyPnlPoint[];
}): WithdrawalResult {
  const {
    startingBalance,
    baseCapital,
    mode,
    percent = 0,
    fixedDollar = 0,
    withdrawOnlyProfitableMonths,
    resetToStartingBalance = false,
    months,
  } = params;

  if (!months.length || startingBalance <= 0) {
    return {
      points: [],
      totalWithdrawn: 0,
      finalEquity: startingBalance,
      cagrPct: 0,
      maxDdPct: 0,
    };
  }

  const denom = baseCapital && baseCapital > 0 ? baseCapital : startingBalance;

  let equity = startingBalance;
  let equityBase = startingBalance; // pure compounding, no withdrawals
  let highWater = equity;
  let maxDdPct = 0;
  let totalWithdrawn = 0;
  const points: WithdrawalPoint[] = [];

  for (const { month, pnl } of months) {
    const monthlyReturn = denom > 0 ? pnl / denom : 0;
    const scaledPnl = equity * monthlyReturn;
    const scaledPnlBase = equityBase * monthlyReturn;

    const profitable = scaledPnl > 0;
    const canWithdraw =
      mode !== "none" &&
      (!withdrawOnlyProfitableMonths || profitable) &&
      equity > 0;

    let withdrawal = 0;
    if (canWithdraw) {
      if (mode === "percentOfProfit" && scaledPnl > 0 && percent > 0) {
        withdrawal = scaledPnl * (percent / 100);
      } else if (mode === "fixedDollar" && fixedDollar > 0) {
        withdrawal = Math.min(fixedDollar, equity + scaledPnl);
      }
    }

    // Apply P/L and withdrawals
    equity = equity + scaledPnl - withdrawal;
    // Base always compounds fully
    equityBase = equityBase + scaledPnlBase;

    // Optional reset: skim any equity above the starting balance
    if (resetToStartingBalance && equity > startingBalance) {
      const extra = equity - startingBalance;
      withdrawal += extra;
      equity = startingBalance;
    }

    totalWithdrawn += withdrawal;

    highWater = Math.max(highWater, equity);
    const ddPct = highWater > 0 ? ((highWater - equity) / highWater) * 100 : 0;
    if (ddPct > maxDdPct) maxDdPct = ddPct;

    points.push({ month, pnl: scaledPnl, withdrawal, equity, equityBase });
  }

  const finalEquity = equity;
  const cagrPct = computeCagrPct(startingBalance, finalEquity, months.length);

  return {
    points,
    totalWithdrawn,
    finalEquity,
    cagrPct,
    maxDdPct,
  };
}
