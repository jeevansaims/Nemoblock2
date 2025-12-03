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
import { MissedProfitTrade } from "@/lib/analytics/missed-profit-analyzer";
import { buildStrategyComparison } from "@/lib/analytics/strategy-comparison";

interface StrategyComparisonProps {
  trades: MissedProfitTrade[];
}

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export function StrategyComparison({ trades }: StrategyComparisonProps) {
  const comparison = buildStrategyComparison(trades);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy Profit vs Optimized TP</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Strategy</TableHead>
              <TableHead className="text-right">Actual P/L</TableHead>
              <TableHead className="text-right">Missed Profit</TableHead>
              <TableHead className="text-right">Best TP</TableHead>
              <TableHead className="text-right">Optimized P/L</TableHead>
              <TableHead className="text-right">Improvement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comparison.rows.map((row) => (
              <TableRow key={row.strategy}>
                <TableCell className="font-medium">{row.strategy}</TableCell>
                <TableCell className="text-right">{fmtUsd(row.actualPL)}</TableCell>
                <TableCell className="text-right text-amber-400 font-semibold">
                  {fmtUsd(row.missedProfit)}
                </TableCell>
                <TableCell className="text-right">
                  {row.bestTP != null ? `+${row.bestTP}%` : "--"}
                </TableCell>
                <TableCell className="text-right">
                  {row.optimizedPL != null ? fmtUsd(row.optimizedPL) : "--"}
                </TableCell>
                <TableCell
                  className={`text-right font-semibold ${
                    (row.improvement || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {row.improvement != null ? fmtUsd(row.improvement) : "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
