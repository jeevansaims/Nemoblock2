import {
  MonthlyPnlPoint,
  runWithdrawalSimulationV2,
} from "@/lib/withdrawals/withdrawalSimulatorV2";

describe("runWithdrawalSimulationV2", () => {
  const mockMonths: MonthlyPnlPoint[] = [
    { month: "2024-01", pnl: 5000 },
    { month: "2024-02", pnl: -2000 },
    { month: "2024-03", pnl: 8000 },
    { month: "2024-04", pnl: 1000 },
  ];

  it("should return correct equity sequence with no withdrawals", () => {
    // Starting 100k
    // M1: 5k/100k = +5%. Eq = 100k * 1.05 = 105,000.
    // M2: -2k/100k = -2%. Eq = 105,000 * 0.98 = 102,900.
    // M3: 8k/100k = +8%. Eq = 102,900 * 1.08 = 111,132.
    // M4: 1k/100k = +1%. Eq = 111,132 * 1.01 = 112,243.32.

    const result = runWithdrawalSimulationV2({
      startingBalance: 100_000,
      mode: "none",
      withdrawOnlyProfitableMonths: false,
      months: mockMonths,
    });

    expect(result.totalWithdrawn).toBe(0);
    const equities = result.points.map((p) => p.equity);
    // 105k, 103k, 111k, 112k
    expect(equities).toEqual([105000, 102900, 111132, 112243.32]);
    // With no withdrawals, equityBase should exactly match equity
    const baseEquities = result.points.map((p) => p.equityBase);
    expect(baseEquities).toEqual(equities);
    expect(result.finalEquity).toBeCloseTo(112243.32, 2);
  });

  it("should handle percent of profit withdrawals correctly", () => {
    // 50% of profit
    const result = runWithdrawalSimulationV2({
      startingBalance: 100_000,
      mode: "percentOfProfit",
      percent: 50,
      withdrawOnlyProfitableMonths: true,
      months: mockMonths,
    });

    // M1: +5%. Eq=105k. Profit=5k. W=2.5k. End=102,500.
    // M2: -2%. Eq=102,500 * 0.98 = 100,450. Loss. W=0. End=100,450.
    // M3: +8%. Eq=100,450 * 1.08 = 108,486. Profit=8,036. W=4,018. End=104,468.
    // M4: +1%. Eq=104,468 * 1.01 = 105,512.68. Profit=1,044.68. W=522.34. End=104,990.34.

    const points = result.points;
    expect(points[0].withdrawal).toBe(2500);
    expect(points[1].withdrawal).toBe(0);
    expect(points[2].withdrawal).toBeCloseTo(4018, 0);
    expect(points[3].withdrawal).toBeCloseTo(522.34, 1);

    expect(result.totalWithdrawn).toBeCloseTo(2500 + 0 + 4018 + 522.34, 1);
  });

  it("should handle fixed dollar withdrawals correctly", () => {
    // Withdraw 1000 fixed
    const result = runWithdrawalSimulationV2({
      startingBalance: 100_000,
      mode: "fixedDollar",
      fixedDollar: 1000,
      withdrawOnlyProfitableMonths: true,
      months: mockMonths,
    });

    // M1: Profit. W=1000.
    // M2: Loss. W=0.
    // M3: Profit. W=1000.
    // M4: Profit. W=1000.
    expect(result.totalWithdrawn).toBe(3000);
  });

  it("should handle reset to starting balance correctly", () => {
    const result = runWithdrawalSimulationV2({
      startingBalance: 100_000,
      mode: "none",
      resetToStartingBalance: true,
      withdrawOnlyProfitableMonths: false,
      months: mockMonths,
    });

    // M1: +5%. Eq=105k. Reset -> W=5k. End=100k.
    // M2: -2%. Eq=98k. No reset. End=98k.
    // M3: +8%. Eq=98k * 1.08 = 105,840. (Profit 7,840).
    // Reset > 100k. Excess = 5,840. W=5,840. End=100k.

    expect(result.points[0].equity).toBe(100_000);
    expect(result.points[0].withdrawal).toBe(5000);

    expect(result.points[1].equity).toBe(98000);
    expect(result.points[1].withdrawal).toBe(0);

    expect(result.points[2].equity).toBe(100_000);
    // Corrected expectation: We only withdraw the EXCESS above 100k.
    expect(result.points[2].withdrawal).toBe(5840);
  });

  it("Config A (Consistency): matches Calendar Baseline when mode=none, normalize=off", () => {
    // Should match P/L Calendar exactly if we use same base capital
    const result = runWithdrawalSimulationV2({
      startingBalance: 160000,
      baseCapital: 160000,
      mode: "none",
      withdrawOnlyProfitableMonths: true,
      resetToStartingBalance: true,
      months: mockMonths,
    });

    // P/L Scaled should == Raw P/L
    expect(result.points[0].pnl).toBeCloseTo(5000, 1);
    expect(result.points[1].pnl).toBeCloseTo(-2000, 1);

    // Withdrawal should equal P/L (skim profit) or 0 (loss)
    // Month 1: +5000 -> Equity 165000 -> Reset to 160000 -> Withdrawal 5000
    expect(result.points[0].withdrawal).toBeCloseTo(5000, 1);
    expect(result.points[0].equity).toBeCloseTo(160000, 1);

    // Month 2: -2000 -> Equity 158000 -> No reset
    expect(result.points[1].withdrawal).toBe(0);
    expect(result.points[1].equity).toBeCloseTo(158000, 1);
  });

  it("Config B (Stability): fixed dollar does not explode", () => {
    // A "Whale" Month but with mismatched base capital (User forgot to normalize)
    // BUT fixed dollar should utilize the baseline return logic now, not arbitrary scaling
    const hugeMonths = [{ month: "2023-01", pnl: 300000 }];

    const result = runWithdrawalSimulationV2({
      startingBalance: 10000,
      baseCapital: 10000, // Implies 3000% return
      mode: "fixedDollar",
      fixedDollar: 5000,
      withdrawOnlyProfitableMonths: true,
      resetToStartingBalance: false,
      months: hugeMonths,
    });

    // Baseline Return = 300k / 10k = 30.0 (3000%)
    // Month Profit = 10k * 30 = 300k.
    // Withdrawal = min(5000, 310k) = 5000.
    // End Equity = 10k + 300k - 5k = 305k.
    // NOT 10^60.
    expect(result.points[0].pnl).toBeCloseTo(300000, 1);
    expect(result.points[0].equity).toBeCloseTo(305000, 1);
    expect(Number.isFinite(result.finalEquity)).toBe(true);
  });

  it("should match the user provided spec example exactly", () => {
    // Spec Example Inputs
    const months: MonthlyPnlPoint[] = [
      { month: "2023-01", pnl: 16000 }, // +10%
      { month: "2023-02", pnl: -8000 }, // -5%
      { month: "2023-03", pnl: 32000 }, // +20%
      { month: "2023-04", pnl: 0 }, // 0%
    ];

    const result = runWithdrawalSimulationV2({
      startingBalance: 160_000,
      baseCapital: 160_000,
      mode: "percentOfProfit",
      percent: 50,
      withdrawOnlyProfitableMonths: true,
      resetToStartingBalance: false,
      months,
    });

    const points = result.points;

    // Month 1 - 2023-01
    // PnlScaled: 16000, Withdrawal: 8000, EquityEnd: 168000
    expect(points[0].month).toBe("2023-01");
    expect(points[0].pnl).toBe(16000);
    expect(points[0].withdrawal).toBe(8000);
    expect(points[0].equity).toBe(168000);

    // Month 2 - 2023-02
    // PnlScaled: -8400, Withdrawal: 0, EquityEnd: 159600
    expect(points[1].month).toBe("2023-02");
    expect(points[1].pnl).toBe(-8400);
    expect(points[1].withdrawal).toBe(0);
    expect(points[1].equity).toBe(159600);

    // Month 3 - 2023-03
    // PnlScaled: 31920, Withdrawal: 15960, EquityEnd: 175560
    expect(points[2].month).toBe("2023-03");
    expect(points[2].pnl).toBe(31920);
    expect(points[2].withdrawal).toBe(15960);
    expect(points[2].equity).toBe(175560);

    // Month 4 - 2023-04
    // PnlScaled: 0, Withdrawal: 0, EquityEnd: 175560
    expect(points[3].month).toBe("2023-04");
    expect(points[3].pnl).toBe(0);
    expect(points[3].withdrawal).toBe(0);
    expect(points[3].equity).toBe(175560);

    // Summary
    expect(result.totalWithdrawn).toBe(23960);
    expect(result.finalEquity).toBe(175560);
    expect(result.maxDdPct).toBeCloseTo(5.0, 1);

    // CAGR check
    // 4 months = 1/3 year. (175560 / 160000) ^ 3 - 1
    // 1.09725 ^ 3 = 1.3207... -> 32.07%
    // Spec says approx 32.1%
    expect(result.cagrPct).toBeCloseTo(32.1, 0); // relaxed precision for date logic
  });
});
