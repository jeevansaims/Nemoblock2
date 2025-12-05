"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AvgPLStats,
  RawTrade,
  buildDailyPnL,
  computeAvgPLStats,
  computeEquityAndWithdrawals,
  normalizeTradesToOneLot,
  WithdrawalMode,
} from "@/lib/analytics/pl-analytics";
import { cn } from "@/lib/utils";

interface PLAnalyticsPanelProps {
  trades: RawTrade[];
}

const fmtUsd = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export function PLAnalyticsPanel({ trades }: PLAnalyticsPanelProps) {
  const [startingBalance, setStartingBalance] = useState(160_000);
  const [withdrawMode, setWithdrawMode] = useState<WithdrawalMode>("none");
  const [withdrawPercent, setWithdrawPercent] = useState(30);
  const [withdrawFixed, setWithdrawFixed] = useState(1_000);
  const [onlyIfProfitable, setOnlyIfProfitable] = useState(true);
  const [normalizeOneLot, setNormalizeOneLot] = useState(false);
  const [allocationSort, setAllocationSort] = useState<
    "portfolioShare" | "netPL" | "rom" | "peakAlloc" | "avgAlloc"
  >("portfolioShare");

  const normalizedTrades = useMemo(() => {
    return normalizeOneLot ? normalizeTradesToOneLot(trades) : trades;
  }, [normalizeOneLot, trades]);

  const daily = useMemo(() => buildDailyPnL(normalizedTrades), [normalizedTrades]);
  const avgStats = useMemo(() => computeAvgPLStats(daily), [daily]);

  const sim = useMemo(
    () =>
      computeEquityAndWithdrawals(normalizedTrades, {
        startingCapital: startingBalance,
        withdrawalMode: withdrawMode,
        withdrawalPercent: withdrawPercent / 100,
        fixedWithdrawal: withdrawFixed,
        withdrawProfitableMonthsOnly: onlyIfProfitable,
        normalizeToOneLot: normalizeOneLot,
      }),
    [normalizedTrades, startingBalance, withdrawMode, withdrawPercent, withdrawFixed, onlyIfProfitable, normalizeOneLot]
  );

  const allocationRows = useMemo(() => {
    if (normalizedTrades.length === 0) return [];

    type StratAgg = {
      strategy: string;
      trades: number;
      totalCapital: number;
      totalPL: number;
      allocations: number[]; // per-trade allocation %
      dailyCapital: Map<string, { capital: number; funds: number }>;
    };

    const byStrategy = new Map<string, StratAgg>();
    const dateKey = (d: Date) => d.toISOString().split("T")[0];

    normalizedTrades.forEach((t) => {
      const strategy = t.strategy || "Uncategorized";
      const capitalUsed =
        t.marginReq && t.marginReq > 0
          ? t.marginReq
          : Math.abs(t.premium ?? 0) * 100;
      const fundsBaseline = t.fundsAtClose ?? 0;
      const allocPct =
        fundsBaseline > 0 ? (capitalUsed / fundsBaseline) * 100 : 0;

      if (!byStrategy.has(strategy)) {
        byStrategy.set(strategy, {
          strategy,
          trades: 0,
          totalCapital: 0,
          totalPL: 0,
          allocations: [],
          dailyCapital: new Map(),
        });
      }
      const agg = byStrategy.get(strategy)!;
      agg.trades += 1;
      agg.totalCapital += capitalUsed;
      agg.totalPL += t.pl;
      agg.allocations.push(allocPct);

      const key = dateKey(t.openedOn);
      const existing = agg.dailyCapital.get(key) ?? { capital: 0, funds: 0 };
      agg.dailyCapital.set(key, {
        capital: existing.capital + capitalUsed,
        funds: Math.max(existing.funds, fundsBaseline),
      });
    });

    const totalCapitalAll = Array.from(byStrategy.values()).reduce(
      (sum, s) => sum + s.totalCapital,
      0
    );

    const rows = Array.from(byStrategy.values()).map((s) => {
      const avgAlloc =
        s.allocations.length > 0
          ? s.allocations.reduce((a, b) => a + b, 0) / s.allocations.length
          : 0;
      const peakDaily = Math.max(
        0,
        ...Array.from(s.dailyCapital.values()).map((d) =>
          d.funds > 0 ? (d.capital / d.funds) * 100 : 0
        )
      );
      const portfolioShare =
        totalCapitalAll > 0 ? (s.totalCapital / totalCapitalAll) * 100 : 0;
      const rom = s.totalCapital > 0 ? (s.totalPL / s.totalCapital) * 100 : 0;

      return {
        strategy: s.strategy,
        trades: s.trades,
        avgAlloc,
        portfolioShare,
        peakDaily,
        netPL: s.totalPL,
        rom,
      };
    });

    const sorter: Record<typeof allocationSort, (a: any, b: any) => number> = {
      portfolioShare: (a, b) => b.portfolioShare - a.portfolioShare,
      netPL: (a, b) => b.netPL - a.netPL,
      rom: (a, b) => b.rom - a.rom,
      peakAlloc: (a, b) => b.peakDaily - a.peakDaily,
      avgAlloc: (a, b) => b.avgAlloc - a.avgAlloc,
    };

    return rows.sort(sorter[allocationSort]);
  }, [normalizedTrades, allocationSort]);

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">No trade data available.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <StatsGrid stats={avgStats} />

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <CardTitle>Realized Strategy Allocation</CardTitle>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground hover:bg-muted/60"
              title="Estimates how much capital each strategy actually deployed, using margin (or premium) divided by Funds at Close. Net P/L respects the current sizing toggle (1-lot switch)."
            >
              ?
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Based on capital used per trade vs. Funds at Close. Avg % is per trade, portfolio share is total capital used by the strategy vs all trades.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1">
              <span className="font-semibold">Sizing</span>
              <span>{normalizeOneLot ? "1-lot normalized" : "Actual P/L"}</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1">
              <span className="font-semibold">Sort</span>
              <select
                className="bg-transparent text-xs"
                value={allocationSort}
                onChange={(e) =>
                  setAllocationSort(e.target.value as typeof allocationSort)
                }
              >
                <option value="portfolioShare">Portfolio share</option>
                <option value="netPL">Net P/L</option>
                <option value="rom">ROM%</option>
                <option value="peakAlloc">Peak daily allocation</option>
                <option value="avgAlloc">Avg % per trade</option>
              </select>
            </div>
            <div className="ml-auto">
              Showing {allocationRows.length} strategies
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[820px] rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="text-muted-foreground">
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Avg % Funds / trade</TableHead>
                    <TableHead className="text-right">Portfolio share</TableHead>
                    <TableHead className="text-right">Peak daily alloc</TableHead>
                    <TableHead className="text-right">Net P/L</TableHead>
                    <TableHead className="text-right">ROM%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocationRows.map((row) => (
                    <TableRow key={row.strategy}>
                      <TableCell className="font-medium">{row.strategy}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.trades}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.avgAlloc.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.portfolioShare.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.peakDaily.toFixed(1)}%</TableCell>
                      <TableCell className={cn("text-right font-mono text-xs", row.netPL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {fmtUsd(row.netPL)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.rom.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Starting balance</Label>
              <Input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(Number(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label>Withdrawal mode</Label>
              <div className="flex flex-wrap gap-2">
                {(["none", "percent", "fixed", "resetToStart"] as WithdrawalMode[]).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={withdrawMode === mode ? "default" : "outline"}
                    onClick={() => setWithdrawMode(mode)}
                  >
                    {mode === "none"
                      ? "None"
                      : mode === "percent"
                      ? "Percent"
                      : mode === "fixed"
                      ? "Fixed $"
                      : "Reset to start"}
                  </Button>
                ))}
              </div>
              {withdrawMode === "percent" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={withdrawPercent}
                    onChange={(e) => setWithdrawPercent(Number(e.target.value) || 0)}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
              {withdrawMode === "fixed" && (
                <Input
                  type="number"
                  value={withdrawFixed}
                  onChange={(e) => setWithdrawFixed(Number(e.target.value) || 0)}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex items-center gap-2">
                <Switch checked={onlyIfProfitable} onCheckedChange={setOnlyIfProfitable} />
                <span className="text-sm text-muted-foreground">Withdraw only on profitable months</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={normalizeOneLot} onCheckedChange={setNormalizeOneLot} />
                <span className="text-sm text-muted-foreground">
                  Normalize to 1-lot (divide P/L & basis by contracts)
                </span>
              </div>
            </div>
          </div>

          <MonthlyTable sim={sim} />
          <EquitySummary sim={sim} />
          <EquityTable sim={sim} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatsGrid({ stats }: { stats: AvgPLStats }) {
  const items = [
    { label: "Avg winning day", value: stats.avgWinningDay },
    { label: "Avg losing day", value: stats.avgLosingDay },
    { label: "Avg winning week", value: stats.avgWinningWeek },
    { label: "Avg losing week", value: stats.avgLosingWeek },
    { label: "Avg winning month", value: stats.avgWinningMonth },
    { label: "Avg losing month", value: stats.avgLosingMonth },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">{item.label}</div>
            <div className={cn("text-lg font-semibold", item.value >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {fmtUsd(item.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MonthlyTable({ sim }: { sim: ReturnType<typeof computeEquityAndWithdrawals> }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Monthly P/L & Withdrawals</h3>
        <div className="text-xs text-muted-foreground">
          {sim.monthly.length} months • Total withdrawn {fmtUsd(sim.totalWithdrawn)}
        </div>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">P/L</TableHead>
              <TableHead className="text-right">Withdrawal</TableHead>
              <TableHead className="text-right">Ending Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sim.monthly.map((row) => (
              <TableRow key={row.month}>
                <TableCell className="font-medium">{row.month}</TableCell>
                <TableCell className={cn("text-right font-mono", row.pl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {fmtUsd(row.pl)}
                </TableCell>
                <TableCell className="text-right font-mono text-amber-300">{fmtUsd(row.withdrawal)}</TableCell>
                <TableCell className="text-right font-mono">{fmtUsd(row.endingEquity)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EquitySummary({ sim }: { sim: ReturnType<typeof computeEquityAndWithdrawals> }) {
  const items = [
    { label: "Ending Capital", value: sim.endingCapital },
    { label: "Total P/L", value: sim.totalPL },
    { label: "Total Withdrawn", value: sim.totalWithdrawn },
    { label: "Max Drawdown", value: `${(sim.maxDrawdownPct * 100).toFixed(2)}%` },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">{item.label}</div>
            <div className="text-lg font-semibold">
              {typeof item.value === "number" && !Number.isNaN(item.value) ? fmtUsd(item.value) : item.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EquityTable({ sim }: { sim: ReturnType<typeof computeEquityAndWithdrawals> }) {
  const rows = sim.daily.slice(-30); // show recent 30 days
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Recent Daily Equity (last {rows.length} days)</h3>
      <div className="rounded-lg border max-h-80 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Day P/L</TableHead>
              <TableHead className="text-right">Withdrawal</TableHead>
              <TableHead className="text-right">Equity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.date}>
                <TableCell>{p.date}</TableCell>
                <TableCell className={cn("text-right font-mono", p.dayPL >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {fmtUsd(p.dayPL)}
                </TableCell>
                <TableCell className="text-right font-mono text-amber-300">
                  {p.withdrawal > 0 ? fmtUsd(p.withdrawal) : "$0"}
                </TableCell>
                <TableCell className="text-right font-mono">{fmtUsd(p.equityAfterWithdrawal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
