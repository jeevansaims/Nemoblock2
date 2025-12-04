import { simulateCapitalPath, type TradeLogRow, type CapitalPathConfig } from "@/lib/analytics/capital-path-simulator";

const baseConfig = (overrides: Partial<CapitalPathConfig> = {}): CapitalPathConfig => ({
  startingCapital: 100_000,
  logType: "sized",
  withdrawalMode: "none",
  ...overrides,
});

describe("simulateCapitalPath", () => {
  test("sized mode with no withdrawals sums P/L", () => {
    const trades: TradeLogRow[] = [
      { openedOn: "2025-01-01", closedOn: "2025-01-02", pl: 10_000 },
      { openedOn: "2025-01-03", closedOn: "2025-01-04", pl: -5_000 },
    ];

    const result = simulateCapitalPath(trades, baseConfig());

    expect(result.totalPL).toBe(5_000);
    expect(result.finalEquity).toBe(105_000);
    expect(result.totalWithdrawn).toBe(0);
  });

  test("percent of monthly profit withdrawal at 50%", () => {
    const trades: TradeLogRow[] = [
      { openedOn: "2025-01-01", closedOn: "2025-01-02", pl: 10_000 },
      { openedOn: "2025-01-03", closedOn: "2025-01-04", pl: -5_000 },
      { openedOn: "2025-01-05", closedOn: "2025-01-06", pl: 5_000 }, // Jan net +10k
      { openedOn: "2025-02-01", closedOn: "2025-02-02", pl: -5_000 },
      { openedOn: "2025-02-03", closedOn: "2025-02-04", pl: -5_000 }, // Feb net -10k
    ];

    const result = simulateCapitalPath(
      trades,
      baseConfig({
        withdrawalMode: "percentOfMonthlyProfit",
        withdrawalProfitPercent: 0.5,
      })
    );

    // Jan: +10k, withdraw 5k → equity 105k
    // Feb: -10k, no withdrawal → equity 95k
    expect(result.finalEquity).toBe(95_000);
    expect(result.totalPL).toBe(-5_000);
    expect(result.totalWithdrawn).toBe(5_000);
  });

  test("reset to starting funds only withdraws above start", () => {
    const trades: TradeLogRow[] = [
      { openedOn: "2025-03-01", closedOn: "2025-03-02", pl: 50_000 },
      { openedOn: "2025-04-01", closedOn: "2025-04-02", pl: -10_000 },
    ];

    const result = simulateCapitalPath(
      trades,
      baseConfig({ withdrawalMode: "resetToStartingFunds" })
    );

    // End of March: equity 150k -> withdraw 50k back to 100k
    // April: -10k -> final 90k
    expect(result.totalWithdrawn).toBe(50_000);
    expect(result.finalEquity).toBe(90_000);
    expect(result.totalPL).toBe(-10_000);
  });
});
