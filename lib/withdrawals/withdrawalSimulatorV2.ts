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
  pnl: number; // monthly P/L (already sized)
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

function computeCagrPct(startingBalance: number, finalEquity: number, months: number): number {
  const years = months / 12;
  if (years <= 0 || startingBalance <= 0) return 0;
  const cagr = Math.pow(finalEquity / startingBalance, 1 / years) - 1;
  return cagr * 100;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function normalizeTrades(trades: WithdrawalTrade[], normalizeToOneLot: boolean): WithdrawalTrade[] {
  if (!normalizeToOneLot) return trades;
  return trades.map((t) => {
    const c = Math.abs(t.numContracts ?? 0) || 1;
    const factor = 1 / c;
    return {
      ...t,
      pl: t.pl * factor,
      premium: t.premium !== undefined ? t.premium * factor : t.premium,
      marginReq: t.marginReq !== undefined ? t.marginReq * factor : t.marginReq,
    };
  });
}

function bucketMonthlyPnl(trades: WithdrawalTrade[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const t of trades) {
    const key = monthKey(t.closedOn ?? t.openedOn);
    buckets[key] = (buckets[key] ?? 0) + t.pl;
  }
  return buckets;
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

  const normalized = normalizeTrades(trades, normalizeToOneLot);
  const buckets = bucketMonthlyPnl(normalized);
  const months = Object.keys(buckets).sort();

  let equity = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;
  const points = months.map((m) => {
    equity += buckets[m];
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
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
    percent = 0,
    fixedDollar = 0,
    withdrawOnlyProfitableMonths,
    normalizeToOneLot,
  } = params;

  if (!trades.length || startingBalance <= 0) {
    return { points: [], totalWithdrawn: 0, finalEquity: startingBalance, cagrPct: 0, maxDdPct: 0 };
  }

  const normalized = normalizeTrades(trades, normalizeToOneLot);
  const buckets = bucketMonthlyPnl(normalized);
  const months = Object.keys(buckets).sort();

  let equity = startingBalance;
  let peak = startingBalance;
  let maxDd = 0;
  let totalWithdrawn = 0;
  const points: WithdrawalPoint[] = [];

  for (const m of months) {
    const pnl = buckets[m];
    equity += pnl;

    const profitable = pnl > 0;
    const canWithdraw = mode !== "none" && (!withdrawOnlyProfitableMonths || profitable) && equity > 0;

    let withdrawal = 0;
    if (canWithdraw) {
      if (mode === "percentOfProfit" && pnl > 0 && percent > 0) {
        withdrawal = pnl * (percent / 100);
      } else if (mode === "fixedDollar" && fixedDollar > 0) {
        withdrawal = Math.min(fixedDollar, equity);
      }
    }

    equity = Math.max(0, equity - withdrawal);
    totalWithdrawn += withdrawal;

    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);

    points.push({ month: m, pnl, withdrawal, equity });
  }

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
