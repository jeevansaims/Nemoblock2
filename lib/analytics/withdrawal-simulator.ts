import { getMonthlyPnL } from "./profit-aggregation";
import { Trade } from "@/lib/models/trade";

export interface WithdrawalRow {
  month: string;
  monthPL: number;
  withdrawal: number;
  endingBalance: number;
}

export interface WithdrawalResult {
  rows: WithdrawalRow[];
  finalBalance: number;
}

interface Options {
  startingBalance?: number;
  withdrawalPct?: number; // 0-1
  withdrawOnlyIfProfitable?: boolean;
  withdrawalMode?: "percent" | "fixed";
  fixedAmount?: number;
}

export function simulateWithdrawals(
  trades: Trade[],
  opts: Options = {}
): WithdrawalResult {
  const startingBalance = opts.startingBalance ?? 100_000;
  const pct = opts.withdrawalPct ?? 0.3;
  const withdrawOnlyIfProfitable = opts.withdrawOnlyIfProfitable ?? true;
  const withdrawalMode = opts.withdrawalMode ?? "percent";
  const fixedAmount = opts.fixedAmount ?? 0;

  const monthly = getMonthlyPnL(trades);

  // ensure chronological
  monthly.sort((a, b) => (a.period < b.period ? -1 : 1));

  const rows: WithdrawalRow[] = [];
  let balance = startingBalance;

  monthly.forEach((m) => {
    const monthPL = m.totalPL;
    const canWithdraw = !withdrawOnlyIfProfitable || monthPL > 0;
    let withdrawal = 0;
    if (canWithdraw) {
      withdrawal =
        withdrawalMode === "fixed" ? Math.max(0, fixedAmount) : monthPL * pct;
    }
    balance = balance + monthPL - withdrawal;

    rows.push({
      month: m.period,
      monthPL,
      withdrawal,
      endingBalance: balance,
    });
  });

  return { rows, finalBalance: balance };
}
