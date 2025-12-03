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
import { StrategyTPSummary } from "@/lib/analytics/single-tp-sweep";
import { cn } from "@/lib/utils";

interface SingleTPStrategyTableProps {
  rows: StrategyTPSummary[];
  title?: string;
}

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const fmtPct = (v: number) => `${v.toFixed(1)}%`;

export function SingleTPStrategyTable({
  rows,
  title = "Single-TP Optimization by Strategy",
}: SingleTPStrategyTableProps) {
  const sorted = [...rows].sort((a, b) => b.extraProfit - a.extraProfit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No strategy data available.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Actual P/L</TableHead>
                <TableHead className="text-right">Capture %</TableHead>
                <TableHead className="text-right">Best TP%</TableHead>
                <TableHead className="text-right">Optimized P/L</TableHead>
                <TableHead className="text-right">Optimized Capture</TableHead>
                <TableHead className="text-right">Extra P/L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.strategy}>
                  <TableCell className="font-medium">{r.strategy}</TableCell>
                  <TableCell className="text-right font-mono">{r.trades}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      r.actualPL > 0
                        ? "text-emerald-400"
                        : r.actualPL < 0
                        ? "text-rose-400"
                        : "text-foreground"
                    )}
                  >
                    {fmtUsd(r.actualPL)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtPct(r.actualCapturePct)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.bestTPPct != null ? `+${r.bestTPPct}%` : "--"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-amber-400">
                    {fmtUsd(r.optimizedPL)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {fmtPct(r.optimizedCapturePct)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono font-semibold",
                      r.extraProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                    )}
                  >
                    {fmtUsd(r.extraProfit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
