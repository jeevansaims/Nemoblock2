export type WithdrawalMode = "none" | "percentOfProfit" | "fixedDollar";

export interface WithdrawalSimSettings {
  startingBalance: number;
  mode: WithdrawalMode;
  percentOfProfit?: number;
  fixedDollar?: number;
  withdrawOnlyProfitableMonths: boolean;
  resetToStart: boolean;
}

export interface MonthlyBaselineEntry {
  monthKey: string; // "YYYY-MM"
  baseReturn: number; // e.g. 0.05 for 5% return (from Funds At Close)
}

export interface WithdrawalPoint {
  month: string;
  pnlScaled: number;
  withdrawal: number;
  equityEnd: number;
  equityBase: number;
}

export interface WithdrawalSimResult {
  points: WithdrawalPoint[];
  totalWithdrawn: number;
  finalEquity: number;
  maxDrawdownPct: number;
  cagrPct: number;
}

function computeCagr(
  startingBalance: number,
  finalEquity: number,
  monthCount: number
): number {
  if (startingBalance <= 0 || finalEquity <= 0 || monthCount <= 0) {
    return 0;
  }
  const years = monthCount / 12;
  if (years <= 0) return 0;
  const factor = finalEquity / startingBalance;
  return (Math.pow(factor, 1 / years) - 1) * 100;
}

/**
 * Pure withdrawal simulator driven by Funds-at-Close returns.
 */
export function runWithdrawalSimulation(
  baselineMonths: MonthlyBaselineEntry[],
  settings: WithdrawalSimSettings
): WithdrawalSimResult {
  const {
    startingBalance,
    mode,
    percentOfProfit = 0,
    fixedDollar = 0,
    withdrawOnlyProfitableMonths,
    resetToStart,
  } = settings;

  let equity = startingBalance;
  let equityBase = startingBalance;

  let highWater = startingBalance;
  let maxDrawdownPct = 0;
  let totalWithdrawn = 0;

  const points: WithdrawalPoint[] = [];

  for (const { monthKey, baseReturn } of baselineMonths) {
    // 1) P/L on *current* equity using the baseline return
    const monthProfit = equity * baseReturn;

    // Track base equity (what-if no withdrawals)
    const baseProfit = equityBase * baseReturn;
    equityBase += baseProfit;

    const isProfitableMonth = monthProfit > 0;
    const canWithdraw = !withdrawOnlyProfitableMonths || isProfitableMonth;

    let withdrawal = 0;

    // 2) Decide withdrawal amount based on mode
    if (mode === "percentOfProfit" && canWithdraw && monthProfit > 0) {
      withdrawal = monthProfit * (percentOfProfit / 100);
    } else if (mode === "fixedDollar" && canWithdraw) {
      const equityAfterPnl = equity + monthProfit;
      const maxAvailable = Math.max(equityAfterPnl, 0);
      withdrawal = Math.min(fixedDollar, maxAvailable);
    }

    // 3) Apply P&L and withdrawal
    equity = equity + monthProfit - withdrawal;
    totalWithdrawn += withdrawal;

    // 4) Optional reset-to-start (withdraw all excess above startingBalance)
    if (resetToStart && equity > startingBalance) {
      const extra = equity - startingBalance;
      equity = startingBalance;
      withdrawal += extra;
      totalWithdrawn += extra;
    }

    // 5) Update drawdown from peak
    if (equity > highWater) {
      highWater = equity;
    }
    const ddPct = highWater > 0 ? ((highWater - equity) / highWater) * 100 : 0;
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
    }

    // 6) Guard against NaN/Infinity explosions
    if (!Number.isFinite(equity) || !Number.isFinite(monthProfit)) {
      console.error("[WithdrawalSim] Non-finite equity/monthProfit", {
        monthKey,
        baseReturn,
        equity,
        monthProfit,
        withdrawal,
      });
      break;
    }

    points.push({
      month: monthKey,
      pnlScaled: monthProfit,
      withdrawal,
      equityEnd: equity,
      equityBase,
    });
  }

  const finalEquity = equity;
  const cagrPct = computeCagr(
    startingBalance,
    finalEquity,
    baselineMonths.length
  );

  return {
    points,
    totalWithdrawn,
    finalEquity,
    maxDrawdownPct,
    cagrPct,
  };
}
