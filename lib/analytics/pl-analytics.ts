import { getISOWeek, getISOWeekYear } from "date-fns";

export type LogType = "sized" | "oneLot";

export interface RawTrade {
  id: string;
  openedOn: Date;
  closedOn: Date;
  pl: number;
  premium?: number;
  marginReq?: number;
  contracts?: number;
}

export interface DailyPnLPoint {
  date: string; // YYYY-MM-DD
  pl: number;
}

export interface EquityPoint {
  date: string; // YYYY-MM-DD
  equity: number;
  dayPL: number;
  withdrawal: number;
}

export interface AvgPLStats {
  avgWinningDay: number;
  avgLosingDay: number;
  avgWinningWeek: number;
  avgLosingWeek: number;
  avgWinningMonth: number;
  avgLosingMonth: number;
}

export type WithdrawalMode = "none" | "percent" | "fixed" | "resetToStart";

export interface WithdrawalConfig {
  startingBalance: number;
  mode: WithdrawalMode;
  percent?: number; // 0-100 when mode === "percent"
  fixedAmount?: number; // dollars when mode === "fixed"
  onlyIfProfitable: boolean;
}

export interface MonthlyPLRow {
  month: string; // YYYY-MM
  pl: number;
  withdrawal: number;
  endingBalance: number;
}

export interface WithdrawalSimulationResult {
  monthly: MonthlyPLRow[];
  finalEndingBalance: number;
  totalWithdrawn: number;
  avgWithdrawalPerMonth: number;
}

export interface CapitalPathResult {
  equityCurve: EquityPoint[];
  startingCapital: number;
  endingCapital: number;
  totalPL: number;
  maxDrawdownPct: number; // peak-to-trough percentage drawdown (negative or zero)
  cagrPct: number;
}

/**
  * Divide trade P/L and basis by contracts to get a 1-lot equivalent view.
  */
export function normalizeTradesToOneLot(trades: RawTrade[]): RawTrade[] {
  return trades.map((t) => {
    const contracts = t.contracts ?? 0;
    if (contracts <= 0) return { ...t };
    return {
      ...t,
      pl: t.pl / contracts,
      premium: t.premium !== undefined ? t.premium / contracts : undefined,
      marginReq: t.marginReq !== undefined ? t.marginReq / contracts : undefined,
    };
  });
}

/**
 * Bucket trades by closed date and sum daily P/L.
 */
export function buildDailyPnL(trades: RawTrade[]): DailyPnLPoint[] {
  const grouped = new Map<string, number>();
  const sorted = [...trades].sort(
    (a, b) => a.closedOn.getTime() - b.closedOn.getTime()
  );

  sorted.forEach((t) => {
    const key = toDateKey(t.closedOn);
    grouped.set(key, (grouped.get(key) ?? 0) + (t.pl || 0));
  });

  return Array.from(grouped.entries())
    .map(([date, pl]) => ({ date, pl }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * Average winning/losing day/week/month from a daily P/L series.
 */
export function computeAvgPLStats(daily: DailyPnLPoint[]): AvgPLStats {
  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const winningDays = daily.filter((d) => d.pl > 0).map((d) => d.pl);
  const losingDays = daily.filter((d) => d.pl < 0).map((d) => d.pl);

  const weeklyMap = new Map<string, number>();
  daily.forEach((d) => {
    const date = new Date(d.date);
    const key = `${getISOWeekYear(date)}-W${getISOWeek(date)}`;
    weeklyMap.set(key, (weeklyMap.get(key) ?? 0) + d.pl);
  });
  const weekly = Array.from(weeklyMap.values());
  const winningWeeks = weekly.filter((v) => v > 0);
  const losingWeeks = weekly.filter((v) => v < 0);

  const monthlyMap = new Map<string, number>();
  daily.forEach((d) => {
    const key = d.date.slice(0, 7); // YYYY-MM
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + d.pl);
  });
  const monthlyVals = Array.from(monthlyMap.values());
  const winningMonths = monthlyVals.filter((v) => v > 0);
  const losingMonths = monthlyVals.filter((v) => v < 0);

  return {
    avgWinningDay: avg(winningDays),
    avgLosingDay: avg(losingDays),
    avgWinningWeek: avg(winningWeeks),
    avgLosingWeek: avg(losingWeeks),
    avgWinningMonth: avg(winningMonths),
    avgLosingMonth: avg(losingMonths),
  };
}

/**
 * Simulate daily equity and monthly withdrawals using raw dollar P/L from the log.
 */
export function simulateWithdrawals(
  daily: DailyPnLPoint[],
  config: WithdrawalConfig
): WithdrawalSimulationResult & CapitalPathResult {
  const {
    startingBalance,
    mode,
    fixedAmount = 0,
    percent = 0,
    onlyIfProfitable,
  } = config;

  let equity = startingBalance;
  let monthPL = 0;
  let totalWithdrawn = 0;
  let peakEquity = startingBalance;
  let maxDrawdownPct = 0;

  const equityCurve: EquityPoint[] = [];
  const monthlyRows: MonthlyPLRow[] = [];

  const days = [...daily].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const applyWithdrawalForMonth = (month: string, isLast: boolean) => {
    if (!isLast) return 0;
    if (onlyIfProfitable && monthPL <= 0) return 0;

    let withdrawal = 0;
    switch (mode) {
      case "percent": {
        withdrawal = Math.min(equity, equity * (percent / 100));
        break;
      }
      case "fixed": {
        withdrawal = Math.min(Math.max(0, fixedAmount), equity);
        break;
      }
      case "resetToStart": {
        if (equity > startingBalance) {
          withdrawal = Math.min(equity - startingBalance, equity);
        }
        break;
      }
      case "none":
      default:
        withdrawal = 0;
    }

    equity -= withdrawal;
    totalWithdrawn += withdrawal;

    monthlyRows.push({
      month,
      pl: monthPL,
      withdrawal,
      endingBalance: equity,
    });

    monthPL = 0; // reset for next month
    return withdrawal;
  };

  days.forEach((day, idx) => {
    const dayMonth = day.date.slice(0, 7);
    const nextMonth = idx < days.length - 1 ? days[idx + 1].date.slice(0, 7) : dayMonth;
    const isLastDayOfMonth = dayMonth !== nextMonth || idx === days.length - 1;

    equity += day.pl;
    monthPL += day.pl;

    peakEquity = Math.max(peakEquity, equity);
    if (peakEquity > 0) {
      const dd = (equity - peakEquity) / peakEquity;
      maxDrawdownPct = Math.min(maxDrawdownPct, dd);
    }

    const withdrawalToday = applyWithdrawalForMonth(dayMonth, isLastDayOfMonth);

    equityCurve.push({
      date: day.date,
      equity,
      dayPL: day.pl,
      withdrawal: withdrawalToday,
    });
  });

  const finalEndingBalance = equity;
  const distinctMonths = new Set(monthlyRows.map((r) => r.month)).size || 1;
  const avgWithdrawalPerMonth = totalWithdrawn / distinctMonths;

  const cagrPct = computeCAGR(
    startingBalance,
    finalEndingBalance,
    days.length > 0 ? new Date(days[0].date) : null,
    days.length > 0 ? new Date(days[days.length - 1].date) : null
  );

  return {
    monthly: monthlyRows,
    finalEndingBalance,
    totalWithdrawn,
    avgWithdrawalPerMonth,
    equityCurve,
    startingCapital: startingBalance,
    endingCapital: finalEndingBalance,
    totalPL: finalEndingBalance - startingBalance,
    maxDrawdownPct,
    cagrPct,
  };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function computeCAGR(
  startBalance: number,
  endBalance: number,
  startDate: Date | null,
  endDate: Date | null
): number {
  if (!startDate || !endDate) return 0;
  const years = Math.max(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365),
    0.0001
  );
  if (startBalance <= 0) return 0;
  return Math.pow(endBalance / startBalance, 1 / years) - 1;
}
