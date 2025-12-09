import {
  MonthlyBaselineEntry,
  runWithdrawalSimulation,
  WithdrawalSimSettings,
} from "@/lib/withdrawals/withdrawalSimulatorV2";

describe("runWithdrawalSimulation (Funds-at-Close V2)", () => {
  // Mock returns derived from Funds At Close
  // Month 1: +5% (100k -> 105k)
  // Month 2: -2% (105k -> 102.9k)
  // Month 3: +10% (102.9k -> 113.19k)
  const mockMonths: MonthlyBaselineEntry[] = [
    { monthKey: "2024-01", baseReturn: 0.05 },
    { monthKey: "2024-02", baseReturn: -0.02 },
    { monthKey: "2024-03", baseReturn: 0.1 },
  ];

  const defaultSettings: WithdrawalSimSettings = {
    startingBalance: 100_000,
    mode: "none",
    withdrawOnlyProfitableMonths: false,
    resetToStart: false,
  };

  it("should return correct equity sequence with no withdrawals", () => {
    // M1: 100000 * 0.05 = 5000 profit. End 105000.
    // M2: 105000 * -0.02 = -2100 profit. End 102900.
    // M3: 102900 * 0.10 = 10290 profit. End 113190.

    const result = runWithdrawalSimulation(mockMonths, {
      ...defaultSettings,
      mode: "none",
    });

    expect(result.totalWithdrawn).toBe(0);
    const equities = result.points.map((p) => p.equityEnd);
    expect(equities).toEqual([105000, 102900, 113190]);
    expect(result.finalEquity).toBe(113190);
  });

  it("should handle percent of profit withdrawals", () => {
    // 50% withdrawals
    const result = runWithdrawalSimulation(mockMonths, {
      ...defaultSettings,
      mode: "percentOfProfit",
      percentOfProfit: 50,
      withdrawOnlyProfitableMonths: true,
    });

    // M1: Profit 5000. W=2500. End=102500.
    // M2: Return -2% on 102500 = -2050. No W. End=100450.
    // M3: Return 10% on 100450 = 10045. W=5022.5. End=100450 + 10045 - 5022.5 = 105472.5.

    expect(result.points[0].withdrawal).toBe(2500);
    expect(result.points[0].equityEnd).toBe(102500);
    expect(result.points[1].withdrawal).toBe(0);
    expect(result.points[1].equityEnd).toBe(100450);
    expect(result.points[2].withdrawal).toBe(5022.5);
    expect(result.points[2].equityEnd).toBe(105472.5);
  });

  it("should match OO Reset-to-Start behavior (User Scenario)", () => {
    // User Scenario:
    // OO Month 1: Funds 160k -> 160,949.88 (+0.59% return approx)
    // OO Month 2: Funds 173,420.96 (+7.7% return approx relative to M1 start? No, M2 return on M1 end).
    // Wait, OO Reset-to-Start means start at 160k EVERY MONTH.
    // So the returns derived from a "raw" equity curve (compounding) would need to be applied to the resetting balance.
    // SIMULATOR uses return explicitly.

    // Let's use implicit returns:
    // M1 return: 0.10 (+10%)
    // M2 return: 0.20 (+20%)

    // Setting: Reset to Start = TRUE.

    const simulator = runWithdrawalSimulation(
      [
        { monthKey: "M1", baseReturn: 0.1 },
        { monthKey: "M2", baseReturn: 0.2 },
      ],
      {
        ...defaultSettings,
        startingBalance: 100_000,
        mode: "none",
        resetToStart: true,
      }
    );

    // M1: Start 100k. Return 10%. Profit 10k. Eq 110k. Reset -> W=10k. End 100k.
    expect(simulator.points[0].pnlScaled).toBe(10000);
    expect(simulator.points[0].withdrawal).toBe(10000);
    expect(simulator.points[0].equityEnd).toBe(100000);

    // M2: Start 100k (reset). Return 20%. Profit 20k. Eq 120k. Reset -> W=20k. End 100k.
    expect(simulator.points[1].pnlScaled).toBe(20000);
    expect(simulator.points[1].withdrawal).toBe(20000);
    expect(simulator.points[1].equityEnd).toBe(100000);

    expect(simulator.totalWithdrawn).toBe(30000);
  });

  it("reproduces the equity curve when there are no withdrawals (Tripwire Test)", () => {
    // Synthetic "Funds at Close" from an OO-style equity curve
    const startingBalance = 100_000;

    const funds = [
      { monthKey: "2023-01", fundsAtClose: 110_000 }, // +10%
      { monthKey: "2023-02", fundsAtClose: 99_000 }, // -10%
      { monthKey: "2023-03", fundsAtClose: 118_800 }, // +20% on 99k
    ];

    // Convert Funds at Close -> monthly returns (what the sim should use)
    const baselineMonths = funds.map((row, idx) => {
      const prevFunds =
        idx === 0 ? startingBalance : funds[idx - 1].fundsAtClose;
      const baseReturn = row.fundsAtClose / prevFunds - 1;
      return { monthKey: row.monthKey, baseReturn };
    });

    const settings: WithdrawalSimSettings = {
      startingBalance,
      mode: "none", // no withdrawals
      percentOfProfit: 0,
      fixedDollar: 0,
      withdrawOnlyProfitableMonths: false,
      resetToStart: false, // pure compounding
    };

    const result = runWithdrawalSimulation(baselineMonths, settings);

    // 1) Equity path should match the original funds-at-close curve exactly (within float precision)
    const equityEndSeries = result.points.map((p) => p.equityEnd);
    const expectedEquitySeries = funds.map((f) => f.fundsAtClose);

    equityEndSeries.forEach((val, idx) => {
      expect(val).toBeCloseTo(expectedEquitySeries[idx], 6);
    });

    // 2) Final equity must match last Funds at Close
    expect(result.finalEquity).toBeCloseTo(
      funds[funds.length - 1].fundsAtClose,
      6
    );

    // 3) No withdrawals taken
    expect(result.totalWithdrawn).toBeCloseTo(0, 6);

    // 4) P/L each month should be (equity * monthly return)
    const returns = baselineMonths.map((b) => b.baseReturn);
    result.points.forEach((point, idx) => {
      const prevEquity =
        idx === 0 ? startingBalance : result.points[idx - 1].equityEnd;
      const expectedPnl = prevEquity * returns[idx];
      expect(point.pnlScaled).toBeCloseTo(expectedPnl, 6);
    });
  });

  it("prevents explosion by using sane returns (Whale Scenario fixed)", () => {
    // Even if we have huge returns, normal usage won't compound to 10^60 if the returns are just "large" (e.g. 50% / month).
    // User's explosion was due to 3000% artificial return from PnL/Base mismatch.
    // Real returns (Funds at Close) are bounded (max 35% per user).

    // Let's verify standard Fixed $ with 35% monthly return (huge but realistic max)
    const whaleMonths = Array(12).fill({ monthKey: "M", baseReturn: 0.35 });

    const result = runWithdrawalSimulation(whaleMonths, {
      startingBalance: 10000,
      mode: "fixedDollar",
      fixedDollar: 1000,
      withdrawOnlyProfitableMonths: true,
      resetToStart: false,
    });

    // 10k * 1.35 ^ 12 -> ~366k. Minus withdrawals.
    // Finite. Sane.
    expect(Number.isFinite(result.finalEquity)).toBe(true);
    expect(result.finalEquity).toBeLessThan(1_000_000); // 1 million cap
  });
});
