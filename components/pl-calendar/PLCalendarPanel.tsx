"use client";

import { format, getMonth, getYear } from "date-fns";
import { Table as TableIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trade } from "@/lib/models/trade";
import { cn } from "@/lib/utils";

import { DayDetailModal, DayStats } from "./DayDetailModal";
import { MonthlyPLCalendar } from "./MonthlyPLCalendar";
import { MonthStats, YearlyPLTable } from "./YearlyPLTable";

interface PLCalendarPanelProps {
  trades: Trade[];
}

export function PLCalendarPanel({ trades }: PLCalendarPanelProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedDayStats, setSelectedDayStats] = useState<DayStats | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Aggregate trades by day
  const dailyStats = useMemo(() => {
    const stats = new Map<string, DayStats>();

    trades.forEach((trade) => {
      // Handle dateOpened which might be a Date object or string
      const date = trade.dateOpened instanceof Date 
        ? trade.dateOpened 
        : new Date(trade.dateOpened);
        
      const dateKey = format(date, "yyyy-MM-dd");

      if (!stats.has(dateKey)) {
        stats.set(dateKey, {
          date: date,
          netPL: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
          totalPremium: 0,
          maxMargin: 0,
          trades: [],
        });
      }

      const dayStat = stats.get(dateKey)!;
      dayStat.netPL += trade.pl;
      dayStat.tradeCount += 1;
      if (trade.pl > 0) dayStat.winCount += 1;
      if (trade.pl < 0) dayStat.lossCount += 1;
      dayStat.totalPremium += trade.premium || 0;
      dayStat.maxMargin = Math.max(dayStat.maxMargin, trade.marginReq || 0);
      dayStat.trades.push(trade);
    });

    return stats;
  }, [trades]);

  // Aggregate trades by month for the current year
  const monthlyStats = useMemo(() => {
    const stats = new Map<number, MonthStats>();
    const year = getYear(currentDate);

    trades.forEach((trade) => {
      const date = trade.dateOpened instanceof Date 
        ? trade.dateOpened 
        : new Date(trade.dateOpened);
        
      if (getYear(date) !== year) return;

      const monthIndex = getMonth(date);

      if (!stats.has(monthIndex)) {
        stats.set(monthIndex, {
          monthIndex,
          netPL: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
          totalPremium: 0,
        });
      }

      const monthStat = stats.get(monthIndex)!;
      monthStat.netPL += trade.pl;
      monthStat.tradeCount += 1;
      if (trade.pl > 0) monthStat.winCount += 1;
      if (trade.pl < 0) monthStat.lossCount += 1;
      monthStat.totalPremium += trade.premium || 0;
    });

    return stats;
  }, [trades, currentDate]);

  // Calculate max margin for the current month to scale utilization bars
  const maxMarginForMonth = useMemo(() => {
    let max = 0;
    const currentMonthStr = format(currentDate, "yyyy-MM");
    
    dailyStats.forEach((stat, dateKey) => {
      if (dateKey.startsWith(currentMonthStr)) {
        max = Math.max(max, stat.maxMargin);
      }
    });
    
    return max;
  }, [dailyStats, currentDate]);

  // Calculate period stats (Month or Year)
  const periodStats = useMemo(() => {
    let netPL = 0;
    let tradeCount = 0;
    let winCount = 0;

    if (view === "month") {
      const currentMonthStr = format(currentDate, "yyyy-MM");
      dailyStats.forEach((stat, dateKey) => {
        if (dateKey.startsWith(currentMonthStr)) {
          netPL += stat.netPL;
          tradeCount += stat.tradeCount;
          winCount += stat.winCount;
        }
      });
    } else {
      monthlyStats.forEach((stat) => {
        netPL += stat.netPL;
        tradeCount += stat.tradeCount;
        winCount += stat.winCount;
      });
    }

    return {
      netPL,
      tradeCount,
      winRate: tradeCount > 0 ? Math.round((winCount / tradeCount) * 100) : 0,
    };
  }, [view, currentDate, dailyStats, monthlyStats]);

  const handleDayClick = (stats: DayStats) => {
    setSelectedDayStats(stats);
    setIsModalOpen(true);
  };

  const years = useMemo(() => {
    const yearsSet = new Set<number>();
    trades.forEach((t) => {
        const date = t.dateOpened instanceof Date 
        ? t.dateOpened 
        : new Date(t.dateOpened);
        yearsSet.add(getYear(date));
    });
    // Ensure current year is always available
    yearsSet.add(new Date().getFullYear());
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [trades]);

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {view === "month" ? "Monthly" : "Yearly"} Net P/L
            </CardTitle>
            <span className="text-muted-foreground">$</span>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                periodStats.netPL >= 0 ? "text-emerald-500" : "text-rose-500"
              )}
            >
              {periodStats.netPL >= 0 ? "+" : ""}
              ${periodStats.netPL.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
            <TableIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{periodStats.tradeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <div className="text-muted-foreground">%</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{periodStats.winRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "month" | "year")}
            className="w-[200px]"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={getYear(currentDate).toString()}
            onValueChange={(val) => {
              const newDate = new Date(currentDate);
              newDate.setFullYear(parseInt(val));
              setCurrentDate(newDate);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-[500px]">
        {view === "month" ? (
          <MonthlyPLCalendar
            currentDate={currentDate}
            onDateChange={setCurrentDate}
            dailyStats={dailyStats}
            onDayClick={handleDayClick}
            maxMarginForPeriod={maxMarginForMonth}
          />
        ) : (
          <YearlyPLTable
            year={getYear(currentDate)}
            monthlyStats={monthlyStats}
          />
        )}
      </div>

      <DayDetailModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        stats={selectedDayStats}
      />
    </div>
  );
}
