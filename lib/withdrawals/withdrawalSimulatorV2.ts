

export type WithdrawalMode = "none" | "percentOfProfit" | "fixedDollar";

export interface WithdrawalTrade {
  openedOn: Date;
  closedOn: Date;
  pl: number;
  premium?: number;
  marginReq?: number;
  numContracts?: number;
  fundsAtClose?: number;
}

export interface WithdrawalPoint {
  month: string; // YYYY-MM
  pnl: number; // scaled monthly P/L
  withdrawal: number;
  equity: number; // ending equity after withdrawal
}

export interface WithdrawalResult {
  points: WithdrawalPoint[];
  totalWithdrawn: number;
  finalEquity: number;
  cagrPct: number;
  maxDdPct: number;
}

type BaseSimResult = {
  points: { month: string; equity: number }[];
  maxDdPct: number;
  cagrPct: number;
  finalEquity: number;
};

function computeCapitalFraction(trade: WithdrawalTrade, startingBalance: number): number {
  const impliedCapital =
    trade.fundsAtClose ??
    trade.marginReq ??
    Math.abs(trade.premium ?? 0) * 100 * Math.max(1, trade.numContracts ?? 1);
  if (!impliedCapital || startingBalance <= 0) return 0;
  return impliedCapital / startingBalance;
}

function computeCagrPct(startingBalance: number, finalEquity: number, months: number): number {
  const years = months / 12;
  if (years <= 0 || startingBalance <= 0) return 0;
  const cagr = Math.pow(finalEquity / startingBalance, 1 / years) - 1;
  return cagr * 100;
}

export function runBaseEquitySimulation(params: {
  startingBalance: number;
  normalizeToOneLot: boolean;
  trades: WithdrawalTrade[];
}): BaseSimResult {
  const { startingBalance, normalizeToOneLot, trades } = params;
  if (!trades.length || startingBalance <= 0) {
    return { points: [], maxDdPct: 0, cagrPct: 0, finalEquity: startingBalance };
  }

  const normalized = trades.map((t) => {
    const c = Math.abs(t.numContracts ?? 0) || 1;
    const factor = normalizeToOneLot ? 1 / c : 1;
    return {
      ...t,
      pl: t.pl * factor,
      premium: t.premium !== undefined ? t.premium * factor : t.premium,
      marginReq: t.marginReq !== undefined ? t.marginReq * factor : t.marginReq,
    };
  });

  const sorted = [...normalized].sort((a, b) => a.closedOn.getTime() - b.closedOn.getTime());
  const buckets: Record<string, { pnl: number }> = {};
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;

  const monthKey = (d: Date) => d.toISOString().slice(0, 7);

  for (const t of sorted) {
    const key = monthKey(t.closedOn ?? t.openedOn);
    if (!buckets[key]) buckets[key] = { pnl: 0 };

    const frac = computeCapitalFraction(t, startingBalance);
    const scaledPnl = t.pl * (frac > 0 ? equity / startingBalance : 1);
    buckets[key].pnl += scaledPnl;

    equity += scaledPnl;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
  }

  const months = Object.keys(buckets).sort();
  const points = months.map((m) => {
    equity += buckets[m].pnl;
    return { month: m, equity };
  });

  const monthsCount = Math.max(months.length, 1);
  return {
    points,
    maxDdPct: maxDd * 100,
    cagrPct: computeCagrPct(startingBalance, equity, monthsCount),
    finalEquity: equity,
  };
}

export function runWithdrawalSimulationV2(params: {
  trades: WithdrawalTrade[];
  startingBalance: number;
  mode: WithdrawalMode;
  percent?: number;
  fixedDollar?: number;
  withdrawOnlyProfitableMonths: boolean;
  normalizeToOneLot: boolean;
}): WithdrawalResult {
  const {
    trades,
    startingBalance,
    mode,
    percent,
    fixedDollar,
    withdrawOnlyProfitableMonths,
    normalizeToOneLot,
  } = params;

  if (!trades.length || startingBalance <= 0) {
    return { points: [], totalWithdrawn: 0, finalEquity: startingBalance, cagrPct: 0, maxDdPct: 0 };
  }

  const normalized = trades.map((t) => {
    const c = Math.abs(t.numContracts ?? 0) || 1;
    const factor = normalizeToOneLot ? 1 / c : 1;
    return {
      ...t,
      pl: t.pl * factor,
      premium: t.premium !== undefined ? t.premium * factor : t.premium,
      marginReq: t.marginReq !== undefined ? t.marginReq * factor : t.marginReq,
    };
  });

  const sorted = [...normalized].sort((a, b) => a.closedOn.getTime() - b.closedOn.getTime());
  const monthKey = (d: Date) => d.toISOString().slice(0, 7);

  let equity = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;
  let totalWithdrawn = 0;
  const points: WithdrawalPoint[] = [];
  let currentMonth: string | null = null;
  let monthProfit = 0;

  const flushMonth = (month: string) => {
    const canWithdraw = !withdrawOnlyProfitableMonths || monthProfit > 0;
    let withdrawal = 0;
    if (mode === "percentOfProfit" && percent && percent > 0 && canWithdraw && monthProfit > 0) {
      withdrawal = monthProfit * (percent / 100);
    } else if (mode === "fixedDollar" && fixedDollar && fixedDollar > 0 && canWithdraw) {
      withdrawal = Math.min(fixedDollar, equity);
    }

    equity = Math.max(0, equity - withdrawal);
    totalWithdrawn += withdrawal;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);

    points.push({ month, pnl: monthProfit, withdrawal, equity });
    monthProfit = 0;
  };

  for (const t of sorted) {
    const key = monthKey(t.closedOn ?? t.openedOn);
    if (currentMonth !== null && key !== currentMonth) {
      flushMonth(currentMonth);
    }
    currentMonth = key;

    const frac = computeCapitalFraction(t, startingBalance);
    const scaledPnl = t.pl * (frac > 0 ? equity / startingBalance : 1);
    equity += scaledPnl;
    monthProfit += scaledPnl;

    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
  }

  if (currentMonth !== null) flushMonth(currentMonth);

  const monthsCount = Math.max(points.length, 1);
  return {
    points,
    totalWithdrawn,
    finalEquity: equity,
    cagrPct: computeCagrPct(startingBalance, equity, monthsCount),
    maxDdPct: maxDd * 100,
  };
}

export function findMaxSafeWithdrawalPercent(params: {
  trades: WithdrawalTrade[];
  startingBalance: number;
  targetMaxDdPct: number;
  withdrawOnlyProfitableMonths: boolean;
  normalizeToOneLot: boolean;
  stepPct?: number;
  maxPct?: number;
}): { safePercent: number; result: WithdrawalResult | null } {
  const {
    trades,
    startingBalance,
    targetMaxDdPct,
    withdrawOnlyProfitableMonths,
    normalizeToOneLot,
    stepPct = 1,
    maxPct = 80,
  } = params;

  let bestPercent = 0;
  let bestResult: WithdrawalResult | null = null;

  for (let pct = 0; pct <= maxPct; pct += stepPct) {
    const result = runWithdrawalSimulationV2({
      trades,
      startingBalance,
      mode: "percentOfProfit",
      percent: pct,
      withdrawOnlyProfitableMonths,
      normalizeToOneLot,
    });
    if (result.maxDdPct <= targetMaxDdPct + 1e-6) {
      bestPercent = pct;
      bestResult = result;
    }
  }

  return { safePercent: bestPercent, result: bestResult };
}
