"use client";

import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { analyzeMissedProfit, MissedProfitTrade } from "@/lib/analytics/missed-profit-analyzer";

interface MissedProfitDashboardProps {
  trades: MissedProfitTrade[];
}

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export function MissedProfitDashboard({ trades }: MissedProfitDashboardProps) {
  const result = analyzeMissedProfit(trades);
  const topMissed = [...result.details]
    .sort((a, b) => b.missedDollar - a.missedDollar)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Missed Profit Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <SummaryTile label="Total Missed" value={fmtUsd(result.totalMissedDollar)} />
          <SummaryTile
            label="Avg Missed / Trade"
            value={fmtUsd(result.avgMissedDollar || 0)}
            sub={`${result.tradesAnalyzed} trades`}
          />
          <SummaryTile
            label="Avg Missed %"
            value={`${result.avgMissedPct.toFixed(1)}%`}
            sub="Across all trades"
          />
          <SummaryTile
            label="Best Capture"
            value={`${result.bestCapturedPct.toFixed(1)}% missed`}
            sub="Closest to full capture"
          />
          <SummaryTile
            label="Worst Miss"
            value={`${result.worstMissedPct.toFixed(1)}%`}
            sub="Highest gap vs. MFE"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top 10 Most Missed Trades</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead className="text-right">Actual %</TableHead>
                  <TableHead className="text-right">Max %</TableHead>
                  <TableHead className="text-right">Missed %</TableHead>
                  <TableHead className="text-right">Missed $</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topMissed.map((row, idx) => (
                  <TableRow key={row.trade.id ?? idx}>
                    <TableCell>
                      {row.trade.openedOn
                        ? format(new Date(row.trade.openedOn), "MMM d, yyyy")
                        : "--"}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {row.trade.strategyName || "Unknown"}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtUsd(row.trade.premiumUsed)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.trade.plPercent.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {row.trade.maxProfitPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right text-amber-300 font-semibold">
                      {row.missedPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right text-amber-400 font-semibold">
                      {fmtUsd(row.missedDollar)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Missed Profit by Strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.byStrategy.slice(0, 6).map((s) => (
              <div key={s.strategy} className="flex items-center justify-between text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{s.strategy}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.trades} trades • {(s.missedPct / s.trades).toFixed(1)}% avg missed
                  </span>
                </div>
                <span className="text-amber-400 font-semibold">{fmtUsd(s.missedDollar)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="text-xl font-semibold text-amber-200">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}
