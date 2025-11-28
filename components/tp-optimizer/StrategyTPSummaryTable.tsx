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
import { Badge } from "@/components/ui/badge";
import { StrategyTPSummaryRow } from "@/lib/analytics/strategy-tp-summary";
import { cn } from "@/lib/utils";

interface StrategyTPSummaryTableProps {
  rows: StrategyTPSummaryRow[];
  title?: string;
  showOnlyImproving?: boolean;
}

const fmtUsd = (v: number | null | undefined) =>
  v == null
    ? "--"
    : `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;

const fmtPct = (v: number | null | undefined) =>
  v == null ? "--" : `${v.toFixed(1)}%`;

export function StrategyTPSummaryTable({
  rows,
  title = "Strategy Profit vs Optimized TP",
  showOnlyImproving,
}: StrategyTPSummaryTableProps) {
  const filtered = (rows || []).filter((r) =>
    showOnlyImproving ? (r.deltaPL ?? 0) > 0 : true
  );
  const sorted = filtered.sort((a, b) => (b.deltaPL ?? 0) - (a.deltaPL ?? 0));

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
                <TableHead className="text-right">Missed $</TableHead>
                <TableHead className="text-right">Avg Missed %</TableHead>
                <TableHead className="text-right">Best TP</TableHead>
                <TableHead className="text-right">Best TP P/L</TableHead>
                <TableHead className="text-right">Δ P/L</TableHead>
                <TableHead className="text-right">Δ %</TableHead>
                <TableHead>Tag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const tag = getTag(row);
                const actualTone =
                  row.actualPL > 0
                    ? "text-emerald-400"
                    : row.actualPL < 0
                    ? "text-rose-400"
                    : "text-foreground";
                const deltaTone =
                  (row.deltaPL ?? 0) > 0
                    ? "text-emerald-400"
                    : (row.deltaPL ?? 0) < 0
                    ? "text-rose-400"
                    : "text-foreground";

                return (
                  <TableRow key={row.strategy}>
                    <TableCell className="font-medium">{row.strategy}</TableCell>
                    <TableCell className="text-right font-mono">{row.trades}</TableCell>
                    <TableCell className={cn("text-right font-mono", actualTone)}>
                      {fmtUsd(row.actualPL)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPct(row.actualCapturePct)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-amber-400">
                      {fmtUsd(row.missedDollar)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPct(row.missedPctAvg)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.bestTPPct != null ? `+${row.bestTPPct}%` : "--"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtUsd(row.bestTPNetPL)}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono", deltaTone)}>
                      {fmtUsd(row.deltaPL)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtPct(row.improvementPct)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tag.variant}>{tag.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function getTag(row: StrategyTPSummaryRow) {
  if (row.bestTPNetPL == null || row.deltaPL == null) {
    return { label: "No TP data", variant: "outline" as const };
  }
  if (row.deltaPL > 0 && (row.improvementPct ?? 0) >= 10) {
    return { label: "Strong TP candidate", variant: "default" as const };
  }
  if (row.deltaPL > 0) {
    return { label: "Moderate TP candidate", variant: "secondary" as const };
  }
  if (row.deltaPL < 0) {
    return { label: "Keep baseline exits", variant: "destructive" as const };
  }
  return { label: "Neutral", variant: "secondary" as const };
}
