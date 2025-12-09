export type WithdrawalMode = "none" | "percentOfProfit" | "fixedDollar";

export interface WithdrawalSimSettings {
  startingBalance: number; // e.g. 160_000
  baselineStartingCapital: number; // same as base capital used to compute monthly P/L (usually 160_000)
  mode: WithdrawalMode;
  percentOfProfit?: number; // used when mode === "percentOfProfit"
  fixedDollar?: number; // used when mode === "fixedDollar"
  withdrawOnlyProfitableMonths: boolean;
  preventCompounding?: boolean; // If true, applies P/L to starting balance (simple interest) instead of current equity
  resetToStart: boolean;
}

export interface MonthlyBaselinePnl {
  monthKey: string; // "YYYY-MM"
  basePnl: number; // same P/L the P/L Calendar uses for that month (on baselineStartingCapital)
}

export interface WithdrawalPoint {
  month: string; // "YYYY-MM"
  pnlScaled: number; // P/L on *current* equity before withdrawal
  withdrawal: number; // withdrawal actually taken that month
  equityEnd: number; // equity after P/L + withdrawal + optional reset
  equityBase: number; // Added to match previous interface usage in UI (tracking pure compounding)
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
 * Pure withdrawal simulator.
 * - baselineMonths must be sorted by monthKey ascending ("YYYY-MM").
 * - basePnl must be the *same* monthly P/L used by the P/L Calendar (on baselineStartingCapital).
 */
export function runWithdrawalSimulation(
  baselineMonths: MonthlyBaselinePnl[],
  settings: WithdrawalSimSettings
): WithdrawalSimResult {
  const {
    startingBalance,
    baselineStartingCapital,
    mode,
    percentOfProfit = 0,
    fixedDollar = 0,
    withdrawOnlyProfitableMonths,
    resetToStart,
  } = settings;

  let equity = startingBalance;
  // Track equityBase (pure compounding) separate from withdrawal-affected equity
  let equityBase = startingBalance;

  let highWater = startingBalance;
  let maxDrawdownPct = 0;
  let totalWithdrawn = 0;

  const points: WithdrawalPoint[] = [];

  for (const { monthKey, basePnl } of baselineMonths) {
    // 1) Convert calendar P/L into a return on baseline capital
    const baseReturn =
      baselineStartingCapital !== 0 ? basePnl / baselineStartingCapital : 0;

    // 2) P/L on *current* equity (this is what shows in the P&L column)
    // If preventCompounding is TRUE, we simulate "Simple Interest" (P/L based on starting balance)
    // This allows Fixed $ mode to be stable (additive) even with "Whale" returns.
    const capitalBasis = settings.preventCompounding ? startingBalance : equity;
    const monthProfit = capitalBasis * baseReturn;

    // Track base equity (what-if no withdrawals)
    // Base equity usually implies compounding for comparison, but if we are in simple mode, maybe base should also be simple?
    // Let's keep base equity consistent with the active mode for fair comparison.
    const baseProfit =
      (settings.preventCompounding ? startingBalance : equityBase) * baseReturn;
    equityBase += baseProfit;

    const isProfitableMonth = monthProfit > 0;
    const canWithdraw = !withdrawOnlyProfitableMonths || isProfitableMonth;

    let withdrawal = 0;

    // 3) Decide withdrawal amount based on mode
    if (mode === "percentOfProfit" && canWithdraw && monthProfit > 0) {
      withdrawal = monthProfit * (percentOfProfit / 100);
    } else if (mode === "fixedDollar" && canWithdraw) {
      const equityAfterPnl = equity + monthProfit;
      const maxAvailable = Math.max(equityAfterPnl, 0);
      withdrawal = Math.min(fixedDollar, maxAvailable);
    }

    // 4) Apply P&L and withdrawal
    equity = equity + monthProfit - withdrawal;
    totalWithdrawn += withdrawal;

    // 5) Optional reset-to-start (withdraw all excess above startingBalance)
    if (resetToStart && equity > startingBalance) {
      const extra = equity - startingBalance;
      equity = startingBalance;
      withdrawal += extra;
      totalWithdrawn += extra;
    }

    // 6) Update drawdown from peak
    if (equity > highWater) {
      highWater = equity;
    }
    const ddPct = highWater > 0 ? ((highWater - equity) / highWater) * 100 : 0;
    if (ddPct > maxDrawdownPct) {
      maxDrawdownPct = ddPct;
    }

    // 7) Guard against NaN/Infinity explosions
    if (!Number.isFinite(equity) || !Number.isFinite(monthProfit)) {
      console.error("[WithdrawalSim] Non-finite equity/monthProfit", {
        monthKey,
        basePnl,
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
