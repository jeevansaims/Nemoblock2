import {
  MonthlyBaselinePnl,
  runWithdrawalSimulation,
  WithdrawalSimSettings,
} from "@/lib/withdrawals/withdrawalSimulatorV2";

describe("runWithdrawalSimulation (Pure V2)", () => {
  const mockMonths: MonthlyBaselinePnl[] = [
    { monthKey: "2024-01", basePnl: 5000 },
    { monthKey: "2024-02", basePnl: -2000 },
    { monthKey: "2024-03", basePnl: 8000 },
    { monthKey: "2024-04", basePnl: 1000 },
  ];

  const defaultSettings: WithdrawalSimSettings = {
    startingBalance: 100_000,
    baselineStartingCapital: 100_000,
    mode: "none",
    withdrawOnlyProfitableMonths: false,
    resetToStart: false,
  };

  it("should return correct equity sequence with no withdrawals", () => {
    // Starting 100k
    // M1: 5k/100k = +5%. Eq = 100k * 1.05 = 105,000.
    // M2: -2k/100k = -2%. Eq = 105,000 * 0.98 = 102,900.
    // M3: 8k/100k = +8%. Eq = 102,900 * 1.08 = 111,132.
    // M4: 1k/100k = +1%. Eq = 111,132 * 1.01 = 112,243.32.

    const result = runWithdrawalSimulation(mockMonths, {
      ...defaultSettings,
      mode: "none",
    });

    expect(result.totalWithdrawn).toBe(0);
    const equities = result.points.map((p) => p.equityEnd);
    // 105k, 103k, 111k, 112k
    expect(equities).toEqual([105000, 102900, 111132, 112243.32]);
    expect(result.finalEquity).toBeCloseTo(112243.32, 2);
  });

  it("should handle percent of profit withdrawals correctly", () => {
    // 50% of profit
    const result = runWithdrawalSimulation(mockMonths, {
      ...defaultSettings,
      mode: "percentOfProfit",
      percentOfProfit: 50,
      withdrawOnlyProfitableMonths: true,
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
    const result = runWithdrawalSimulation(mockMonths, {
      ...defaultSettings,
      mode: "fixedDollar",
      fixedDollar: 1000,
      withdrawOnlyProfitableMonths: true,
    });

    // M1: Profit. W=1000.
    // M2: Loss. W=0.
    // M3: Profit. W=1000.
    // M4: Profit. W=1000.
    expect(result.totalWithdrawn).toBe(3000);
  });

  it("should handle reset to starting balance correctly", () => {
    const result = runWithdrawalSimulation(mockMonths, {
      ...defaultSettings,
      mode: "none",
      resetToStart: true,
      withdrawOnlyProfitableMonths: false,
    });

    // M1: +5%. Eq=105k. Reset -> W=5k. End=100k.
    // M2: -2%. Eq=98k. No reset. End=98k.
    // M3: +8%. Eq=98k * 1.08 = 105,840. (Profit 7,840).
    // Reset > 100k. Excess = 5,840. W=5,840. End=100k.

    expect(result.points[0].equityEnd).toBe(100_000);
    expect(result.points[0].withdrawal).toBe(5000);

    expect(result.points[1].equityEnd).toBe(98000);
    expect(result.points[1].withdrawal).toBe(0);

    expect(result.points[2].equityEnd).toBe(100_000);
    expect(result.points[2].withdrawal).toBe(5840);
  });

  it("Config A (Consistency): matches Calendar Baseline when mode=none", () => {
    // Should match P/L Calendar exactly if we use same base capital
    const result = runWithdrawalSimulation(mockMonths, {
      startingBalance: 160000,
      baselineStartingCapital: 160000,
      mode: "none",
      withdrawOnlyProfitableMonths: true,
      resetToStart: true,
    });

    // M1: +5000 / 160k return.
    // M2: -2000
    // M3: 8000
    // M4: 1000

    // P/L Scaled should == Raw P/L
    expect(result.points[0].pnlScaled).toBeCloseTo(5000, 1);
    expect(result.points[1].pnlScaled).toBeCloseTo(-2000, 1);

    // Withdrawal should equal P/L (skim profit) or 0 (loss)
    // Month 1: +5000 -> Equity 165000 -> Reset to 160000 -> Withdrawal 5000
    expect(result.points[0].withdrawal).toBeCloseTo(5000, 1);
    expect(result.points[0].equityEnd).toBeCloseTo(160000, 1);

    // Month 2: -2000 -> Equity 158000 -> No reset
    expect(result.points[1].withdrawal).toBe(0);
    expect(result.points[1].equityEnd).toBeCloseTo(158000, 1);
  });

  it("Config B (Stability): fixed dollar does not explode on mismatched base", () => {
    // A "Whale" Month but with mismatched base capital (User forgot to normalize)
    const hugeMonths = [{ monthKey: "2023-01", basePnl: 300000 }];

    const result = runWithdrawalSimulation(hugeMonths, {
      startingBalance: 10000,
      baselineStartingCapital: 10000, // Implies 3000% return
      mode: "fixedDollar",
      fixedDollar: 5000,
      withdrawOnlyProfitableMonths: true,
      resetToStart: false,
    });

    // Baseline Return = 300k / 10k = 30.0 (3000%)
    // Month Profit = 10k * 30 = 300k.
    // Withdrawal = min(5000, 310k) = 5000.
    // End Equity = 10k + 300k - 5k = 305k.
    // NOT 10^60.
    expect(result.points[0].pnlScaled).toBeCloseTo(300000, 1);
    expect(result.points[0].equityEnd).toBeCloseTo(305000, 1);
    expect(Number.isFinite(result.finalEquity)).toBe(true);
  });

  it("Config B (Normal PnL): fixed dollar behaves predictably", () => {
    // Standard Config: 160k base, normal returns
    const months: MonthlyBaselinePnl[] = [
      { monthKey: "2023-01", basePnl: 16000 }, // +10%
      { monthKey: "2023-02", basePnl: -8000 }, // -5%
      { monthKey: "2023-03", basePnl: 32000 }, // +20%
    ];

    const result = runWithdrawalSimulation(months, {
      startingBalance: 160000,
      baselineStartingCapital: 160000,
      mode: "fixedDollar",
      fixedDollar: 10000,
      withdrawOnlyProfitableMonths: true,
      resetToStart: false,
    });

    // M1: Return +10%. PnL 16k. W=10k. Eq=166k.
    expect(result.points[0].pnlScaled).toBeCloseTo(16000);
    expect(result.points[0].withdrawal).toBe(10000);
    expect(result.points[0].equityEnd).toBeCloseTo(166000);

    // M2: Return -5%. PnL on 166k = -8300. W=0 (loss). Eq=157,700.
    expect(result.points[1].pnlScaled).toBeCloseTo(-8300);
    expect(result.points[1].withdrawal).toBe(0);
    expect(result.points[1].equityEnd).toBeCloseTo(157700);

    // M3: Return +20%. PnL on 157,700 = 31,540. W=10k. Eq=179,240.
    expect(result.points[2].pnlScaled).toBeCloseTo(31540);
    expect(result.points[2].withdrawal).toBe(10000);
    expect(result.points[2].equityEnd).toBeCloseTo(179240);
  });

  it("should match the user provided spec example exactly", () => {
    // Spec Example Inputs
    const months: MonthlyBaselinePnl[] = [
      { monthKey: "2023-01", basePnl: 16000 }, // +10%
      { monthKey: "2023-02", basePnl: -8000 }, // -5%
      { monthKey: "2023-03", basePnl: 32000 }, // +20%
      { monthKey: "2023-04", basePnl: 0 }, // 0%
    ];

    const result = runWithdrawalSimulation(months, {
      startingBalance: 160_000,
      baselineStartingCapital: 160_000,
      mode: "percentOfProfit",
      percentOfProfit: 50,
      withdrawOnlyProfitableMonths: true,
      resetToStart: false,
    });

    const points = result.points;

    // Month 1 - 2023-01
    // PnlScaled: 16000, Withdrawal: 8000, EquityEnd: 168000
    expect(points[0].month).toBe("2023-01");
    expect(points[0].pnlScaled).toBe(16000);
    expect(points[0].withdrawal).toBe(8000);
    expect(points[0].equityEnd).toBe(168000);

    // Month 2 - 2023-02
    // PnlScaled: -8400, Withdrawal: 0, EquityEnd: 159600
    expect(points[1].month).toBe("2023-02");
    expect(points[1].pnlScaled).toBe(-8400);
    expect(points[1].withdrawal).toBe(0);
    expect(points[1].equityEnd).toBe(159600);

    // Month 3 - 2023-03
    // PnlScaled: 31920, Withdrawal: 15960, EquityEnd: 175560
    expect(points[2].month).toBe("2023-03");
    expect(points[2].pnlScaled).toBe(31920);
    expect(points[2].withdrawal).toBe(15960);
    expect(points[2].equityEnd).toBe(175560);

    // Month 4 - 2023-04
    // PnlScaled: 0, Withdrawal: 0, EquityEnd: 175560
    expect(points[3].month).toBe("2023-04");
    expect(points[3].pnlScaled).toBe(0);
    expect(points[3].withdrawal).toBe(0);
    expect(points[3].equityEnd).toBe(175560);

    // Summary
    expect(result.totalWithdrawn).toBe(23960);
    expect(result.finalEquity).toBe(175560);
    expect(result.maxDrawdownPct).toBeCloseTo(5.0, 1);

    // CAGR check
    expect(result.cagrPct).toBeCloseTo(32.1, 0);
  });
});
