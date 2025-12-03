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
import { simulateTPGrid } from "@/lib/analytics/tp-grid-optimizer";

interface MultiTPOptimizerProps {
  trades: MissedProfitTrade[];
}

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export function MultiTPOptimizer({ trades }: MultiTPOptimizerProps) {
  const result = simulateTPGrid(trades);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-TP Optimizer (single TP sweep)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Best single take-profit per strategy based on MFE (max profit %) vs actual exits.
        </p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Best TP</TableHead>
                <TableHead className="text-right">Net P/L</TableHead>
                <TableHead className="text-right">Avg P/L</TableHead>
                <TableHead className="text-right">Win Rate</TableHead>
                <TableHead className="text-right">Trades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.strategies.map((s) => {
                const best = s.bestTP;
                return (
                  <TableRow key={s.strategy}>
                    <TableCell className="font-medium">{s.strategy}</TableCell>
                    <TableCell className="text-right">
                      {best ? `+${best.tpPercent}%` : "--"}
                    </TableCell>
                    <TableCell className="text-right text-amber-400 font-semibold">
                      {best ? fmtUsd(best.netPL) : "--"}
                    </TableCell>
                    <TableCell className="text-right">
                      {best ? fmtUsd(best.avgPL) : "--"}
                    </TableCell>
                    <TableCell className="text-right">
                      {best ? `${best.winRate.toFixed(1)}%` : "--"}
                    </TableCell>
                    <TableCell className="text-right">{best?.trades ?? 0}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
