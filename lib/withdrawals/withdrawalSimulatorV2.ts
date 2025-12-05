export interface MonthlyPnlPoint {
  month: string; // "2023-05"
  pnl: number; // backtest P/L for that month
}

export type WithdrawalMode = "none" | "percent" | "fixed";

export interface WithdrawalSimulationParams {
  backtestCapital: number;
  startingCapital: number;
  monthlyPnl: MonthlyPnlPoint[];
  mode: WithdrawalMode;
  withdrawalPercent?: number; // decimal, e.g. 0.02
  fixedAmount?: number;
  withdrawOnlyOnProfits?: boolean;
}

export interface WithdrawalRow {
  month: string;
  pnl: number; // scaled P/L
  withdrawal: number;
  endingBalance: number;
}

export interface WithdrawalSimulationResult {
  rows: WithdrawalRow[];
  totalWithdrawn: number;
  endingBalance: number;
  cagrPct: number;
  maxDdPct: number;
}

export function runWithdrawalSimulationV2(params: WithdrawalSimulationParams): WithdrawalSimulationResult {
  const {
    backtestCapital,
    startingCapital,
    monthlyPnl,
    mode,
    withdrawalPercent,
    fixedAmount,
    withdrawOnlyOnProfits = true,
  } = params;

  if (!monthlyPnl.length || startingCapital <= 0 || backtestCapital <= 0) {
    return { rows: [], totalWithdrawn: 0, endingBalance: startingCapital, cagrPct: 0, maxDdPct: 0 };
  }

  const rows: WithdrawalRow[] = [];
  let equity = startingCapital;
  let totalWithdrawn = 0;
  let highWater = startingCapital;
  let peakEquity = startingCapital;
  let maxDd = 0;

  for (const m of monthlyPnl) {
    const sizeFactor = equity / backtestCapital;
    const scaledPnl = m.pnl * sizeFactor;
    let equityBeforeWithdrawal = equity + scaledPnl;

    let withdrawal = 0;
    const isProfitableMonth = scaledPnl > 0;
    const isNewHigh = equityBeforeWithdrawal > highWater;
    const allowed =
      mode !== "none" &&
      (!withdrawOnlyOnProfits || (isProfitableMonth && isNewHigh));

    if (allowed) {
      if (mode === "percent" && withdrawalPercent && withdrawalPercent > 0) {
        withdrawal = equityBeforeWithdrawal * withdrawalPercent;
      } else if (mode === "fixed" && fixedAmount && fixedAmount > 0) {
        withdrawal = Math.min(fixedAmount, equityBeforeWithdrawal);
      }
    }

    equityBeforeWithdrawal = Math.max(equityBeforeWithdrawal, 0);
    const endingBalance = Math.max(equityBeforeWithdrawal - withdrawal, 0);

    highWater = Math.max(highWater, equityBeforeWithdrawal);
    peakEquity = Math.max(peakEquity, endingBalance);
    const dd = peakEquity > 0 ? (peakEquity - endingBalance) / peakEquity : 0;
    if (dd > maxDd) maxDd = dd;

    totalWithdrawn += withdrawal;
    equity = endingBalance;

    rows.push({ month: m.month, pnl: scaledPnl, withdrawal, endingBalance });
  }

  const endingBalance = equity;
  const months = monthlyPnl.length;
  const years = months / 12;
  let cagrPct = 0;
  if (years > 0 && startingCapital > 0) {
    const cagr = Math.pow(endingBalance / startingCapital || 1, 1 / years) - 1;
    cagrPct = cagr * 100;
  }

  return {
    rows,
    totalWithdrawn,
    endingBalance,
    cagrPct,
    maxDdPct: maxDd * 100,
  };
}
