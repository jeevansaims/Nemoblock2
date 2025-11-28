"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeAvgWinLoss, getDailyPnL, getMonthlyPnL, getWeeklyPnL } from "@/lib/analytics/profit-aggregation";
import { simulateWithdrawals } from "@/lib/analytics/withdrawal-simulator";
import { Trade } from "@/lib/models/trade";
import { cn } from "@/lib/utils";

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export function AvgPLDashboard({ trades }: { trades: Trade[] }) {
  const daily = useMemo(() => getDailyPnL(trades), [trades]);
  const weekly = useMemo(() => getWeeklyPnL(trades), [trades]);
  const monthly = useMemo(() => getMonthlyPnL(trades), [trades]);

  const dailyStats = computeAvgWinLoss(daily);
  const weeklyStats = computeAvgWinLoss(weekly);
  const monthlyStats = computeAvgWinLoss(monthly);

  const [startingBalance, setStartingBalance] = useState(100000);
  const [withdrawalPct, setWithdrawalPct] = useState(30);
  const [withdrawOnlyIfProfitable, setWithdrawOnlyIfProfitable] = useState(true);
  const [withdrawalMode, setWithdrawalMode] = useState<"percent" | "fixed">(
    "percent"
  );
  const [fixedWithdrawal, setFixedWithdrawal] = useState(1000);

  const withdrawalResult = useMemo(
    () =>
      simulateWithdrawals(trades, {
        startingBalance,
        withdrawalPct: withdrawalPct / 100,
        withdrawOnlyIfProfitable,
        withdrawalMode,
        fixedAmount: fixedWithdrawal,
      }),
    [trades, startingBalance, withdrawalPct, withdrawOnlyIfProfitable, withdrawalMode, fixedWithdrawal]
  );

  const totals = useMemo(() => {
    const totalWithdrawals = withdrawalResult.rows.reduce(
      (sum, r) => sum + r.withdrawal,
      0
    );
    const months = withdrawalResult.rows.length || 1;
    return {
      totalWithdrawals,
      avgWithdrawal: totalWithdrawals / months,
    };
  }, [withdrawalResult.rows]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Average P/L</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <StatTile
            label="Avg Winning Day"
            value={fmtUsd(dailyStats.avgWin)}
            tone="positive"
          />
          <StatTile
            label="Avg Losing Day"
            value={fmtUsd(dailyStats.avgLoss)}
            tone="negative"
          />
          <StatTile
            label="Avg Winning Week"
            value={fmtUsd(weeklyStats.avgWin)}
            tone="positive"
          />
          <StatTile
            label="Avg Losing Week"
            value={fmtUsd(weeklyStats.avgLoss)}
            tone="negative"
          />
          <StatTile
            label="Avg Winning Month"
            value={fmtUsd(monthlyStats.avgWin)}
            tone="positive"
          />
          <StatTile
            label="Avg Losing Month"
            value={fmtUsd(monthlyStats.avgLoss)}
            tone="negative"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdrawal Simulator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="starting">Starting balance</Label>
              <Input
                id="starting"
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label>Withdrawal mode</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={withdrawalMode === "percent" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWithdrawalMode("percent")}
                >
                  Percent
                </Button>
                <Button
                  type="button"
                  variant={withdrawalMode === "fixed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setWithdrawalMode("fixed")}
                >
                  Fixed $
                </Button>
              </div>
              {withdrawalMode === "percent" ? (
                <>
                  <Slider
                    min={0}
                    max={100}
                    step={5}
                    value={[withdrawalPct]}
                    onValueChange={([v]) => setWithdrawalPct(v)}
                  />
                  <div className="text-sm text-muted-foreground">{withdrawalPct}%</div>
                </>
              ) : (
                <Input
                  type="number"
                  value={fixedWithdrawal}
                  onChange={(e) => setFixedWithdrawal(Number(e.target.value) || 0)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Withdraw only if profitable</Label>
              <div className="flex items-center gap-2">
                <Switch
                  checked={withdrawOnlyIfProfitable}
                  onCheckedChange={setWithdrawOnlyIfProfitable}
                />
                <span className="text-sm text-muted-foreground">
                  Only withdraw on positive months
                </span>
              </div>
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
                {withdrawalResult.rows.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        row.monthPL > 0
                          ? "text-emerald-500"
                          : row.monthPL < 0
                          ? "text-rose-500"
                          : "text-foreground"
                      )}
                    >
                      {fmtUsd(row.monthPL)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-amber-400">
                      {fmtUsd(row.withdrawal)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtUsd(row.endingBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="text-right text-sm font-semibold">
            <div>Final Ending Balance: {fmtUsd(withdrawalResult.finalBalance)}</div>
            <div className="text-xs text-muted-foreground">
              Total Withdrawals: {fmtUsd(totals.totalWithdrawals)} • Avg / Month:{" "}
              {fmtUsd(totals.avgWithdrawal)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-rose-400"
      : "text-foreground";

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={cn("text-xl font-semibold", toneClass)}>{value}</div>
    </div>
  );
}
