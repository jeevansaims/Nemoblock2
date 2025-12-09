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
    // 1. BASELINE: Always derive from the calendar P/L (passed as `pnl` in `months`)
    // `denom` is the baseline capital (usually 160k or 10M for whales)
    const basePnl = pnl;
    const baseReturn = denom > 0 ? basePnl / denom : 0;

    // P/L on current equity this month
    const monthProfit = equity * baseReturn;

    // Base equity just compounds fully (what-if no withdrawals)
    const scaledPnlBase = equityBase * baseReturn;
    equityBase = equityBase + scaledPnlBase;

    // 2. WITHDRAWAL LOGIC
    const isProfitableMonth = monthProfit > 0;
    const canWithdraw =
      mode !== "none" && (!withdrawOnlyProfitableMonths || isProfitableMonth);

    let withdrawal = 0;

    if (canWithdraw) {
      if (mode === "percentOfProfit" && isProfitableMonth && percent > 0) {
        withdrawal = monthProfit * (percent / 100);
      } else if (mode === "fixedDollar" && fixedDollar > 0) {
        // Prevent withdrawing more than we have (equity + profit)
        const equityAfterPnl = equity + monthProfit;
        const maxAvailable = Math.max(equityAfterPnl, 0);
        withdrawal = Math.min(fixedDollar, maxAvailable);
      }
    }

    // 3. UPDATE EQUITY
    equity = equity + monthProfit - withdrawal;
    totalWithdrawn += withdrawal;

    // 4. RESET TO START
    if (resetToStartingBalance && equity > startingBalance) {
      const extra = equity - startingBalance;
      withdrawal += extra;
      totalWithdrawn += extra;
      equity = startingBalance;
    }

    highWater = Math.max(highWater, equity);
    const ddPct = highWater > 0 ? ((highWater - equity) / highWater) * 100 : 0;
    if (ddPct > maxDdPct) maxDdPct = ddPct;

    // Safety rail: catch explosions (e.g. 10^60) caused by mismatched base capital
    if (!Number.isFinite(equity)) {
      console.warn(
        `[WithdrawalSim] Equity exploded/NaN at ${month}. Base: ${baseCapital}, Start: ${startingBalance}, PnL: ${basePnl}. Bailing.`
      );
      break;
    }

    points.push({ month, pnl: monthProfit, withdrawal, equity, equityBase });
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
