"use client";

// PLCalendarPanel: Main component for the P/L Calendar feature
import { endOfWeek, format, getISOWeek, getISOWeekYear, getMonth, getYear, startOfWeek } from "date-fns";
import { Download, Filter, Table as TableIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { usePLCalendarSettings } from "@/lib/hooks/use-pl-calendar-settings";
import { cn } from "@/lib/utils";

import { PLCalendarSettingsMenu } from "./PLCalendarSettingsMenu";
import { DailyDetailModal, DaySummary } from "./DayDetailModal";
import { MonthlyPLCalendar } from "./MonthlyPLCalendar";
import { YearHeatmap, YearlyCalendarSnapshot } from "./YearHeatmap";
import { MonthStats } from "./YearlyPLTable";

interface PLCalendarPanelProps {
  trades: Trade[];
}

const formatCompactUsd = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000_000)
    return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000)
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

interface WeekSummary extends DaySummary {
  endDate: Date;
}

export function PLCalendarPanel({ trades }: PLCalendarPanelProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "year">("month");
  const [selectedDayStats, setSelectedDayStats] = useState<DaySummary | null>(
    null
  );
  const [modalMode, setModalMode] = useState<"day" | "week">("day");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("all");
  const [drawdownThreshold, setDrawdownThreshold] = useState(10);
  const [stressRange, setStressRange] = useState<{ p5: number; p50: number; p95: number } | null>(
    null
  );
  const [weeklyMode, setWeeklyMode] = useState<"trailing7" | "calendarWeek">("trailing7");
  const { settings: calendarSettings, setSettings: setCalendarSettings } = usePLCalendarSettings();

  const strategies = useMemo(() => {
    const s = new Set<string>();
    trades.forEach((t) => {
      if (t.strategy) s.add(t.strategy);
      else s.add("Custom");
    });
    return ["all", ...Array.from(s).sort()];
  }, [trades]);

  const filteredTrades = useMemo(() => {
    if (selectedStrategy === "all") return trades;
    return trades.filter((t) => (t.strategy || "Custom") === selectedStrategy);
  }, [trades, selectedStrategy]);

  // Aggregate trades by day
  // This useMemo calculates daily stats including win/loss counts and rolling metrics
  const dailyStats = useMemo(() => {
    const stats = new Map<string, DaySummary>();

    filteredTrades.forEach((trade) => {
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
          winRate: 0,
          winCount: 0,
          maxMargin: 0,
          trades: [],
        });
      }

      const dayStat = stats.get(dateKey)!;
      dayStat.netPL += trade.pl;
      dayStat.tradeCount += 1;
      if (trade.pl > 0) dayStat.winCount += 1;
      dayStat.maxMargin = Math.max(dayStat.maxMargin, trade.marginReq || 0);
      
      // Map Trade to DailyTrade
      dayStat.trades.push({
        id: undefined, // Trade model doesn't have ID
        dateOpened: trade.dateOpened instanceof Date ? trade.dateOpened.toISOString() : trade.dateOpened,
        strategy: trade.strategy || "Custom",
        legs: trade.legs || "",
        premium: trade.premium || 0,
        margin: trade.marginReq || 0,
        pl: trade.pl
      });
    });
    
    // Calculate win rates
    stats.forEach((stat) => {
      const wins = stat.winCount;
      stat.winRate =
        stat.tradeCount > 0
          ? Math.round((wins / stat.tradeCount) * 100)
          : 0;
    });

    // Compute cumulative equity and rolling drawdowns
    const sortedKeys = Array.from(stats.keys()).sort();
    let cumulative = 0;
    let peak = 0;
    const rollingWindow: string[] = [];
    const rollingWeeklyMap = new Map<string, number>();
    const weekMap = new Map<string, number>();
    let currentStreak = 0;
    sortedKeys.forEach((key) => {
      const stat = stats.get(key)!;
      cumulative += stat.netPL;
      peak = Math.max(peak, cumulative);
      const drawdownPct = peak > 0 ? ((cumulative - peak) / peak) * 100 : 0;
      stat.drawdownPct = drawdownPct;
      stat.cumulativePL = cumulative;

      // rolling 7-day return
      rollingWindow.push(key);
      while (rollingWindow.length > 0) {
        const first = new Date(rollingWindow[0]);
        const current = new Date(key);
        if ((current.getTime() - first.getTime()) / (1000 * 60 * 60 * 24) > 6) {
          rollingWindow.shift();
        } else {
          break;
        }
      }
      const rollingSum = rollingWindow.reduce((sum, k) => sum + (stats.get(k)?.netPL ?? 0), 0);
      rollingWeeklyMap.set(key, rollingSum);
      stat.rollingWeeklyPL = rollingSum;

      // calendar week aggregation
      const d = new Date(key);
      const weekKey = `${getISOWeekYear(d)}-${getISOWeek(d)}`;
      weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + stat.netPL);

      // streaks across all days
      if (stat.netPL > 0) {
        currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      } else if (stat.netPL < 0) {
        currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      } else {
        currentStreak = 0;
      }
      stat.streak = currentStreak;
    });

    // assign calendarWeekPL
    sortedKeys.forEach((key) => {
      const stat = stats.get(key)!;
      const d = new Date(key);
      const weekKey = `${getISOWeekYear(d)}-${getISOWeek(d)}`;
      stat.calendarWeekPL = weekMap.get(weekKey) ?? 0;
    });

    return stats;
  }, [filteredTrades]);

  // Aggregate trades by month for the current year
  const monthlyStats = useMemo(() => {
    const stats = new Map<number, MonthStats>();
    const year = getYear(currentDate);

    filteredTrades.forEach((trade) => {
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
  }, [filteredTrades, currentDate]);

  // Aggregate trades by year/month for the heatmap
  const yearlySnapshot = useMemo<YearlyCalendarSnapshot>(() => {
    const yearMap = new Map<number, Map<number, { netPL: number; trades: number; wins: number }>>();

    filteredTrades.forEach((trade) => {
      const date = trade.dateOpened instanceof Date ? trade.dateOpened : new Date(trade.dateOpened);
      const y = getYear(date);
      const m = getMonth(date);

      if (!yearMap.has(y)) yearMap.set(y, new Map());
      const monthMap = yearMap.get(y)!;
      if (!monthMap.has(m)) monthMap.set(m, { netPL: 0, trades: 0, wins: 0 });
      const entry = monthMap.get(m)!;
      entry.netPL += trade.pl;
      entry.trades += 1;
      if (trade.pl > 0) entry.wins += 1;
    });

    const years = Array.from(yearMap.entries())
      .map(([year, monthsMap]) => {
        const months = Array.from(monthsMap.entries()).map(([month, vals]) => ({
          month,
          netPL: vals.netPL,
          trades: vals.trades,
          winRate: vals.trades > 0 ? Math.round((vals.wins / vals.trades) * 100) : 0,
        }));

        const total = months.reduce(
          (acc, m) => {
            acc.netPL += m.netPL;
            acc.trades += m.trades;
            acc.wins += Math.round((m.winRate / 100) * m.trades);
            return acc;
          },
          { netPL: 0, trades: 0, wins: 0 }
        );

        return {
          year,
          months,
          total: {
            netPL: total.netPL,
            trades: total.trades,
            winRate: total.trades > 0 ? Math.round((total.wins / total.trades) * 100) : 0,
          },
        };
      })
      .sort((a, b) => b.year - a.year);

    return { years };
  }, [filteredTrades]);

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

  // Simple Monte Carlo stress on current month daily P/L
  useEffect(() => {
    const currentMonthStr = format(currentDate, "yyyy-MM");
    const dailyPl: number[] = [];
    dailyStats.forEach((stat, key) => {
      if (key.startsWith(currentMonthStr)) dailyPl.push(stat.netPL);
    });
    if (dailyPl.length === 0) {
      setStressRange(null);
      return;
    }
    const runs = 200;
    const horizon = Math.max(5, dailyPl.length);
    const outcomes: number[] = [];
    for (let i = 0; i < runs; i++) {
      let total = 0;
      for (let h = 0; h < horizon; h++) {
        const pick = dailyPl[Math.floor(Math.random() * dailyPl.length)];
        total += pick;
      }
      outcomes.push(total);
    }
    outcomes.sort((a, b) => a - b);
    const pct = (p: number) => outcomes[Math.floor((p / 100) * outcomes.length)];
    setStressRange({ p5: pct(5), p50: pct(50), p95: pct(95) });
  }, [dailyStats, currentDate]);

  const exportMonthCsv = () => {
    const currentMonthStr = format(currentDate, "yyyy-MM");
    const headers = ["Date", "NetPL", "Trades", "WinRate", "DrawdownPct", "RollingWeeklyPL"];
    const rows: string[] = [];
    dailyStats.forEach((stat, key) => {
      if (key.startsWith(currentMonthStr)) {
        rows.push(
          [
            key,
            stat.netPL,
            stat.tradeCount,
            stat.winRate,
            stat.drawdownPct ?? "",
            stat.rollingWeeklyPL ?? "",
          ].join(",")
        );
      }
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pl-calendar-${currentMonthStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthPng = () => {
    window.print();
  };

  // Calculate period stats (Month or Year)
  const periodStats = useMemo(() => {
    let netPL = 0;
    let tradeCount = 0;
    let winCount = 0;
    let rolling7d = 0;

    if (view === "month") {
      const currentMonthStr = format(currentDate, "yyyy-MM");
      const keysInMonth = Array.from(dailyStats.keys())
        .filter((k) => k.startsWith(currentMonthStr))
        .sort();
      dailyStats.forEach((stat, dateKey) => {
        if (dateKey.startsWith(currentMonthStr)) {
          netPL += stat.netPL;
          tradeCount += stat.tradeCount;
          winCount += stat.winCount;
        }
      });
      // rolling 7d sum using last seven days in month
      const recentKeys = keysInMonth.slice(-7);
      rolling7d = recentKeys.reduce(
        (sum, key) => sum + (dailyStats.get(key)?.netPL ?? 0),
        0
      );
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
      rolling7d,
    };
  }, [view, currentDate, dailyStats, monthlyStats]);

  const weeklyStats = useMemo(() => {
    const weeks = new Map<string, WeekSummary>();
    const currentMonthStr = format(currentDate, "yyyy-MM");

    dailyStats.forEach((stat, dateKey) => {
      if (!dateKey.startsWith(currentMonthStr)) return;

      const weekStart = startOfWeek(stat.date);
      const weekEnd = endOfWeek(stat.date);
      const weekKey = format(weekStart, "yyyy-MM-dd");

      if (!weeks.has(weekKey)) {
        weeks.set(weekKey, {
          date: weekStart,
          endDate: weekEnd,
          netPL: 0,
          tradeCount: 0,
          winRate: 0,
          winCount: 0,
          maxMargin: 0,
          trades: [],
          dailyBreakdown: [],
        });
      }

      const weekStat = weeks.get(weekKey)!;
      weekStat.netPL += stat.netPL;
      weekStat.tradeCount += stat.tradeCount;
      weekStat.winCount += stat.winCount;
      weekStat.maxMargin = Math.max(weekStat.maxMargin, stat.maxMargin);
      weekStat.trades.push(...stat.trades);
      weekStat.dailyBreakdown?.push({
        date: stat.date,
        netPL: stat.netPL,
        tradeCount: stat.tradeCount,
        winRate:
          stat.tradeCount > 0
            ? Math.round((stat.winCount / stat.tradeCount) * 100)
            : 0,
        premium: stat.trades.reduce((sum, t) => sum + (t.premium || 0), 0),
        margin: stat.trades.reduce((sum, t) => sum + (t.margin || 0), 0),
      });
    });

    weeks.forEach((week) => {
      week.winRate =
        week.tradeCount > 0
          ? Math.round((week.winCount / week.tradeCount) * 100)
          : 0;
    });

    return Array.from(weeks.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [dailyStats, currentDate]);

  const handleDayClick = (stats: DaySummary) => {
    setSelectedDayStats(stats);
    setModalMode("day");
    setIsModalOpen(true);
  };

  const handleWeekClick = (stats: WeekSummary) => {
    setSelectedDayStats(stats);
    setModalMode("week");
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
              {formatCompactUsd(periodStats.netPL)}
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="inline-flex items-center rounded-full border bg-muted/40 p-1 text-xs">
            <Button
              size="sm"
              variant={weeklyMode === "trailing7" ? "default" : "ghost"}
              className="h-6 px-3 rounded-full"
              onClick={() => setWeeklyMode("trailing7")}
            >
              7d
            </Button>
            <Button
              size="sm"
              variant={weeklyMode === "calendarWeek" ? "default" : "ghost"}
              className="h-6 px-3 rounded-full"
              onClick={() => setWeeklyMode("calendarWeek")}
            >
              Week
            </Button>
          </div>

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

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Strategy" />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All strategies" : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Drawdown &gt; %</label>
            <input
              type="number"
              className="w-20 rounded border bg-background px-2 py-1 text-sm"
              value={drawdownThreshold}
              onChange={(e) => setDrawdownThreshold(Number(e.target.value) || 0)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportMonthCsv}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportMonthPng}>
              <TableIcon className="mr-2 h-4 w-4" />
              Print/PNG
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="min-h-[500px]">
        {view === "month" ? (
          <div className="space-y-6">
            <MonthlyPLCalendar
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              dailyStats={dailyStats}
              onDayClick={handleDayClick}
              maxMarginForPeriod={maxMarginForMonth}
              drawdownThreshold={drawdownThreshold}
              weeklyMode={weeklyMode}
              settings={calendarSettings}
            />

            {weeklyStats.length > 0 && (
              <WeeklySummaryGrid
                weeks={weeklyStats}
                onWeekClick={handleWeekClick}
              />
            )}
          </div>
        ) : (
          <YearHeatmap
            data={yearlySnapshot}
            onMonthClick={(year, monthIndex) => {
              const newDate = new Date(currentDate);
              newDate.setFullYear(year);
              newDate.setMonth(monthIndex);
              setCurrentDate(newDate);
              setView("month");
            }}
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Period snapshot & stress</CardTitle>
            <PLCalendarSettingsMenu
              settings={calendarSettings}
              onChange={setCalendarSettings}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div>
            <p className="text-xs text-muted-foreground">Net P/L</p>
            <p className={cn("text-lg font-semibold", periodStats.netPL >= 0 ? "text-emerald-500" : "text-rose-500")}>
              {formatCompactUsd(periodStats.netPL)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Trades</p>
            <p className="text-lg font-semibold">{periodStats.tradeCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-lg font-semibold">{periodStats.winRate}%</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rolling 7d</p>
            <p className={cn("text-lg font-semibold", periodStats.rolling7d >= 0 ? "text-emerald-500" : "text-rose-500")}>
              {formatCompactUsd(periodStats.rolling7d)}
            </p>
          </div>
          {stressRange && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">MC stress (p5 / p50 / p95)</p>
              <p className="text-sm font-semibold">
                <span className="text-rose-500">{formatCompactUsd(stressRange.p5)}</span>{" "}
                / {formatCompactUsd(stressRange.p50)}{" "}
                <span className="text-emerald-500">{formatCompactUsd(stressRange.p95)}</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <DailyDetailModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        summary={selectedDayStats}
        mode={modalMode}
      />
    </div>
  );
}

function WeeklySummaryGrid({
  weeks,
  onWeekClick,
}: {
  weeks: WeekSummary[];
  onWeekClick: (week: WeekSummary) => void;
}) {
  const formatCompactUsd = (value: number) => {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Weekly summary</h3>
        <p className="text-xs text-muted-foreground">
          {weeks.length} week{weeks.length === 1 ? "" : "s"} in view
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {weeks.map((week) => {
          const rangeLabel = `${format(week.date, "MMM d")} – ${format(
            week.endDate ?? week.date,
            "MMM d"
          )}`;

          const tone =
            week.netPL > 0
              ? "from-emerald-500/20 to-emerald-500/5 border-emerald-900/40 text-emerald-100"
              : week.netPL < 0
              ? "from-rose-500/20 to-rose-500/5 border-rose-900/40 text-rose-100"
              : "from-zinc-700/10 to-zinc-800/10 border-zinc-700/40 text-zinc-200";

          return (
            <button
              key={week.date.toISOString()}
              onClick={() => onWeekClick(week)}
              className={cn(
                "min-w-[240px] flex-1 rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 hover:shadow-lg",
                "bg-gradient-to-br",
                tone
              )}
              title={`P/L: ${formatCompactUsd(week.netPL)} • Trades: ${week.tradeCount} • Max Margin: ${formatCompactUsd(week.maxMargin)}`}
            >
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                <span className="text-white/70">{rangeLabel}</span>
                <span className={week.netPL >= 0 ? "text-emerald-300" : "text-rose-300"}>
                  {week.netPL >= 0 ? "+" : "-"}
                  {formatCompactUsd(Math.abs(week.netPL))}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/80">
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-white/50">Trades</div>
                  <div className="text-sm font-semibold">{week.tradeCount}</div>
                </div>
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-white/50">Win Rate</div>
                  <div className="text-sm font-semibold">{week.winRate}%</div>
                </div>
                <div className="rounded-lg bg-black/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-white/50">Max Margin</div>
                  <div className="text-sm font-semibold">
                    {formatCompactUsd(week.maxMargin)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
