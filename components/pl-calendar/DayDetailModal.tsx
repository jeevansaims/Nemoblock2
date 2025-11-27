"use client";

import { format } from "date-fns";
import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Trade } from "@/lib/models/trade";

export interface DayStats {
  date: Date;
  netPL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  totalPremium: number;
  maxMargin: number;
  trades: Trade[];
}

interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: DayStats | null;
}

export function DayDetailModal({ isOpen, onClose, stats }: DayDetailModalProps) {
  if (!stats) return null;

  const winRate =
    stats.tradeCount > 0
      ? Math.round((stats.winCount / stats.tradeCount) * 100)
      : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span>{format(stats.date, "MMMM d, yyyy")}</span>
            <Badge
              variant={stats.netPL >= 0 ? "default" : "destructive"}
              className={cn(
                "ml-2",
                stats.netPL >= 0
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : "bg-rose-500 hover:bg-rose-600"
              )}
            >
              {stats.netPL >= 0 ? "+" : ""}
              ${stats.netPL.toLocaleString()}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Daily Performance Review
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <div className="rounded-lg border bg-card p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">
              Net P/L
            </div>
            <div
              className={cn(
                "text-lg font-bold",
                stats.netPL >= 0 ? "text-emerald-500" : "text-rose-500"
              )}
            >
              {stats.netPL >= 0 ? "+" : ""}
              ${stats.netPL.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">
              Trades
            </div>
            <div className="text-lg font-bold">{stats.tradeCount}</div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">
              Win Rate
            </div>
            <div className="text-lg font-bold">{winRate}%</div>
          </div>
          <div className="rounded-lg border bg-card p-3 text-center shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">
              Max Margin
            </div>
            <div className="text-lg font-bold">
              ${Math.round(stats.maxMargin).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Legs</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.trades.map((trade, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {trade.timeOpened || format(new Date(trade.dateOpened), "HH:mm")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {trade.strategy || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex max-w-[200px] items-center gap-1 truncate text-xs text-muted-foreground cursor-help">
                              <Info className="h-3 w-3 shrink-0" />
                              <span className="truncate">{trade.legs}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm break-words text-xs">
                            {trade.legs}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${trade.premium?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      ${trade.marginReq?.toLocaleString()}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-medium",
                        trade.pl >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}
                    >
                      {trade.pl >= 0 ? "+" : ""}
                      ${trade.pl.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
