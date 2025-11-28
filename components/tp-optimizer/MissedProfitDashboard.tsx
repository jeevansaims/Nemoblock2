"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzeMissedProfit,
  MissedProfitTrade,
} from "@/lib/analytics/missed-profit-analyzer";

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

  // Strategy-level view only: sort all strategies by total missed $
  const strategiesSorted = [...result.byStrategy].sort(
    (a, b) => b.missedDollar - a.missedDollar
  );

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

      <Card>
        <CardHeader>
          <CardTitle>Missed Profit by Strategy</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Total Missed $</TableHead>
                <TableHead className="text-right">Avg Missed %</TableHead>
                <TableHead className="text-right">Total Missed %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategiesSorted.map((s) => {
                const avgMissedPct = s.trades > 0 ? s.missedPct / s.trades : 0;

                return (
                  <TableRow key={s.strategy}>
                    <TableCell className="font-medium">
                      {s.strategy || "Unknown"}
                    </TableCell>
                    <TableCell className="text-right">{s.trades}</TableCell>
                    <TableCell className="text-right text-amber-400 font-semibold">
                      {fmtUsd(s.missedDollar)}
                    </TableCell>
                    <TableCell className="text-right">
                      {avgMissedPct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {s.missedPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
