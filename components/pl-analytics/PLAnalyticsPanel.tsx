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
  CapitalPathResult,
  RawTrade,
  WithdrawalConfig,
  WithdrawalMode,
  buildDailyPnL,
  computeAvgPLStats,
  normalizeTradesToOneLot,
  simulateWithdrawals,
} from "@/lib/analytics/pl-analytics";
import { cn } from "@/lib/utils";

interface PLAnalyticsPanelProps {
  trades: RawTrade[];
}

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export function PLAnalyticsPanel({ trades }: PLAnalyticsPanelProps) {
  const [startingBalance, setStartingBalance] = useState(160_000);
  const [withdrawMode, setWithdrawMode] = useState<WithdrawalMode>("none");
  const [withdrawPercent, setWithdrawPercent] = useState(30);
  const [withdrawFixed, setWithdrawFixed] = useState(1_000);
  const [onlyIfProfitable, setOnlyIfProfitable] = useState(true);
  const [normalizeOneLot, setNormalizeOneLot] = useState(false);

  const normalizedTrades = useMemo(
    () => (normalizeOneLot ? normalizeTradesToOneLot(trades) : trades),
    [normalizeOneLot, trades]
  );

  const daily = useMemo(() => buildDailyPnL(normalizedTrades), [normalizedTrades]);
  const avgStats = useMemo(() => computeAvgPLStats(daily), [daily]);

  const withdrawalConfig: WithdrawalConfig = useMemo(
    () => ({
      startingBalance,
      mode: withdrawMode,
      percent: withdrawPercent,
      fixedAmount: withdrawFixed,
      onlyIfProfitable,
    }),
    [startingBalance, withdrawMode, withdrawPercent, withdrawFixed, onlyIfProfitable]
  );

  const sim = useMemo(() => simulateWithdrawals(daily, withdrawalConfig), [daily, withdrawalConfig]);

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

function MonthlyTable({ sim }: { sim: ReturnType<typeof simulateWithdrawals> }) {
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
                <TableCell className="text-right font-mono">{fmtUsd(row.endingBalance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EquitySummary({ sim }: { sim: CapitalPathResult }) {
  const items = [
    { label: "Ending Capital", value: sim.endingCapital },
    { label: "Total P/L", value: sim.totalPL },
    { label: "Max Drawdown", value: `${(sim.maxDrawdownPct * 100).toFixed(2)}%` },
    { label: "CAGR", value: `${(sim.cagrPct * 100).toFixed(2)}%` },
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

function EquityTable({ sim }: { sim: CapitalPathResult }) {
  const rows = sim.equityCurve.slice(-30); // show recent 30 days
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
                <TableCell className="text-right font-mono">{fmtUsd(p.equity)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
