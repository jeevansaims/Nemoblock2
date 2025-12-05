/**
 * Trade shape for withdrawal sim. Keeps it minimal and typed locally.
 */
export interface WithdrawalTrade {
  closeDate: Date;
  pnl: number;
  premium?: number;
  marginReq?: number;
  numContracts?: number;
  fundsAtClose?: number;
}

export interface WithdrawalRule {
  monthlyWithdrawalPct: number; // e.g. 0.3 => withdraw 30% of profit above high water
}

export interface WithdrawalSimInputs {
  trades: WithdrawalTrade[];
  startingCapital: number;
  baselineKellyScale: number; // Kelly scale of the source P/L (usually 1.0)
  targetKellyScale: number; // Kelly scale being tested
  rule: WithdrawalRule;
}

export interface WithdrawalSimPoint {
  date: Date;
  equity: number;
  withdrawnToDate: number;
}

export interface WithdrawalSimResult {
  points: WithdrawalSimPoint[];
  totalWithdrawn: number;
  finalEquity: number;
  cagrPct: number;
  maxDdPct: number;
}

/**
 * Simulate withdrawals with dynamic sizing:
 * - Re-sizes P/L by equity / startingCapital * targetKelly / baselineKelly.
 * - Withdraws monthlyPct of profits above high water at month boundaries.
 */
export function runWithdrawalSimulationV2(inputs: WithdrawalSimInputs): WithdrawalSimResult {
  const { trades, startingCapital, baselineKellyScale, targetKellyScale, rule } = inputs;

  const sorted = [...trades].sort((a, b) => a.closeDate.getTime() - b.closeDate.getTime());

  let equity = startingCapital;
  let highWater = startingCapital;
  let totalWithdrawn = 0;
  let maxDd = 0;
  let currentMonth: string | null = null;

  const points: WithdrawalSimPoint[] = [];

  for (const t of sorted) {
    const monthKey = `${t.closeDate.getFullYear()}-${t.closeDate.getMonth()}`;

    // Month boundary: take withdrawal on profit above high water.
    if (currentMonth !== null && monthKey !== currentMonth) {
      const profit = Math.max(0, equity - highWater);
      if (profit > 0 && rule.monthlyWithdrawalPct > 0) {
        const withdrawal = profit * rule.monthlyWithdrawalPct;
        equity -= withdrawal;
        totalWithdrawn += withdrawal;
        highWater = Math.max(highWater, equity);
      }
    }
    currentMonth = monthKey;

    // Dynamic sizing factor relative to original Kelly sizing.
    const capitalScale = (equity / startingCapital) * (targetKellyScale / baselineKellyScale);
    const boundedScale = Math.max(0, Math.min(capitalScale, 2)); // clamp extremes
    const scaledPnl = t.pnl * boundedScale;

    equity += scaledPnl;
    highWater = Math.max(highWater, equity);
    if (highWater > 0) {
      const dd = (highWater - equity) / highWater;
      maxDd = Math.max(maxDd, dd);
    }

    points.push({ date: t.closeDate, equity, withdrawnToDate: totalWithdrawn });
  }

  const days = points.length || 1;
  const years = days / 252;
  const cagr = years > 0 ? Math.pow(equity / startingCapital, 1 / years) - 1 : 0;

  return {
    points,
    totalWithdrawn,
    finalEquity: equity,
    cagrPct: cagr * 100,
    maxDdPct: maxDd * 100,
  };
}
