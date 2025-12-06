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

// --- Trade-level capital-aware simulator (V3) ---
export interface WithdrawalTrade {
  closedOn: Date;
  pl: number;
  premium?: number;
  marginReq?: number;
  numContracts?: number;
  fundsAtClose?: number;
}

export interface WithdrawalSimV3Params {
  backtestCapital: number;
  startingCapital: number;
  trades: WithdrawalTrade[];
  mode: WithdrawalMode;
  withdrawalPercent?: number;
  fixedAmount?: number;
  withdrawOnlyOnProfits?: boolean;
}

export function runWithdrawalSimulationV3(params: WithdrawalSimV3Params): WithdrawalSimulationResult {
  const {
    backtestCapital,
    startingCapital,
    trades,
    mode,
    withdrawalPercent,
    fixedAmount,
    withdrawOnlyOnProfits = true,
  } = params;

  if (!trades.length || startingCapital <= 0 || backtestCapital <= 0) {
    return { rows: [], totalWithdrawn: 0, endingBalance: startingCapital, cagrPct: 0, maxDdPct: 0 };
  }

  const sorted = [...trades].sort((a, b) => a.closedOn.getTime() - b.closedOn.getTime());

  const rows: WithdrawalRow[] = [];
  let equity = startingCapital;
  let totalWithdrawn = 0;
  let highWater = startingCapital;
  let peakEquity = startingCapital;
  let maxDd = 0;
  let currentMonth: string | null = null;
  let monthPnl = 0;

  const pushMonth = (monthKey: string) => {
    // apply withdrawal at month boundary
    let withdrawal = 0;
    const equityBefore = equity;
    const isProfitableMonth = monthPnl > 0;
    const isNewHigh = equityBefore > highWater;
    const allowed =
      mode !== "none" && (!withdrawOnlyOnProfits || (isProfitableMonth && isNewHigh));
    if (allowed) {
      if (mode === "percent" && withdrawalPercent && withdrawalPercent > 0) {
        withdrawal = equityBefore * withdrawalPercent;
      } else if (mode === "fixed" && fixedAmount && fixedAmount > 0) {
        withdrawal = Math.min(fixedAmount, equityBefore);
      }
    }
    const endingBalance = Math.max(equityBefore - withdrawal, 0);
    highWater = Math.max(highWater, equityBefore);
    peakEquity = Math.max(peakEquity, endingBalance);
    const dd = peakEquity > 0 ? (peakEquity - endingBalance) / peakEquity : 0;
    maxDd = Math.max(maxDd, dd);
    totalWithdrawn += withdrawal;
    equity = endingBalance;
    rows.push({ month: monthKey, pnl: monthPnl, withdrawal, endingBalance });
    monthPnl = 0;
  };

  for (const t of sorted) {
    const monthKey = `${t.closedOn.getFullYear()}-${String(t.closedOn.getMonth() + 1).padStart(2, "0")}`;
    if (currentMonth !== null && monthKey !== currentMonth) {
      pushMonth(currentMonth);
    }
    currentMonth = monthKey;

    const capitalUsed =
      t.fundsAtClose ??
      t.marginReq ??
      Math.abs(t.premium ?? 0) * 100 * Math.max(1, t.numContracts ?? 1);
    const fraction = capitalUsed && backtestCapital > 0 ? capitalUsed / backtestCapital : 0;
    const baselineDeployed = backtestCapital * fraction;
    const liveCapital = equity * fraction;
    const scale =
      fraction > 0 && baselineDeployed > 0 ? liveCapital / baselineDeployed : equity / backtestCapital;
    const scaledPnl = t.pl * scale;
    equity += scaledPnl;
    monthPnl += scaledPnl;
    peakEquity = Math.max(peakEquity, equity);
    const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
    maxDd = Math.max(maxDd, dd);
  }

  if (currentMonth !== null) {
    pushMonth(currentMonth);
  }

  const endingBalance = equity;
  const months = rows.length || 1;
  const years = months / 12;
  const cagr = years > 0 && startingCapital > 0 ? Math.pow(endingBalance / startingCapital, 1 / years) - 1 : 0;

  return {
    rows,
    totalWithdrawn,
    endingBalance,
    cagrPct: cagr * 100,
    maxDdPct: maxDd * 100,
  };
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
