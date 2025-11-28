"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { DaySummary } from "./DayDetailModal";

interface MonthlyPLCalendarProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
  dailyStats: Map<string, DaySummary>;
  onDayClick: (stats: DaySummary) => void;
  maxMarginForPeriod: number;
  drawdownThreshold?: number;
  weeklyMode: "trailing7" | "calendarWeek";
}

export function MonthlyPLCalendar({
  currentDate,
  onDateChange,
  dailyStats,
  onDayClick,
  maxMarginForPeriod,
  drawdownThreshold = 10,
  weeklyMode,
}: MonthlyPLCalendarProps) {
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

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const dayEntries = calendarDays.map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const stats = dailyStats.get(dateKey);
    const isCurrentMonth = isSameMonth(day, monthStart);
    const isDrawdown =
      stats && stats.drawdownPct !== undefined
        ? stats.drawdownPct <= -Math.abs(drawdownThreshold)
        : false;
    const utilization =
      stats && maxMarginForPeriod > 0
        ? (stats.maxMargin / maxMarginForPeriod) * 100
        : 0;

    return {
      day,
      dateKey,
      stats,
      isCurrentMonth,
      isDrawdown,
      utilization,
    };
  });

  // chunk into weeks of 7
  const weeks: typeof dayEntries[] = [];
  for (let i = 0; i < dayEntries.length; i += 7) {
    weeks.push(dayEntries.slice(i, i + 7));
  }

  const weekPLs = weeks.map((week) =>
    week.reduce((sum, entry) => sum + (entry.stats?.netPL ?? 0), 0)
  );
  const maxWeekAbsPL =
    weekPLs.length > 0
      ? Math.max(1, ...weekPLs.map((v) => Math.abs(v)))
      : 1;

  const fmtShortUsd = (v: number) => {
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return `${sign}$${abs.toFixed(0)}`;
  };

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    onDateChange(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    onDateChange(newDate);
  };

  return (
    <Card className="h-full border-none shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-2xl font-bold">
          {format(currentDate, "MMMM yyyy")}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px bg-muted/20 text-center text-sm font-medium text-muted-foreground">
          {weekDays.map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="space-y-1 bg-muted/20 p-1">
          {weeks.map((week, idx) => {
            const weekPL = weekPLs[idx];
            const weekBg =
              weekPL > 0
                ? "bg-emerald-500/5"
                : weekPL < 0
                ? "bg-rose-500/5"
                : "bg-muted/40";
            return (
              <div
                key={`week-${idx}`}
                className={cn("rounded-xl px-1 pt-1 pb-1.5 transition-colors", weekBg)}
              >
                <div className="grid grid-cols-7 gap-[1px]">
                  {week.map((entry) => {
                    const { day, stats, isCurrentMonth, isDrawdown, utilization } = entry;
                    return (
                      <div
                        key={day.toString()}
                        onClick={() => stats && onDayClick(stats)}
                        className={cn(
                          "relative flex min-h-[100px] flex-col justify-between bg-background p-2 transition-colors hover:bg-muted/50",
                          !isCurrentMonth && "bg-muted/5 text-muted-foreground",
                          stats && "cursor-pointer",
                          isDrawdown && "ring-2 ring-rose-500/60"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              !isCurrentMonth && "text-muted-foreground/50"
                            )}
                          >
                            {format(day, "d")}
                          </span>
                          {stats && (
                            <span className="text-xs text-muted-foreground">
                              {stats.tradeCount}t
                            </span>
                          )}
                        </div>

                        {stats && (
                          <div className="mt-2 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <div
                                className={cn(
                                  "text-center text-sm font-bold",
                                  stats.netPL >= 0 ? "text-emerald-500" : "text-rose-500"
                                )}
                              >
                                {formatCompactUsd(stats.netPL)}
                              </div>
                              <span className="text-[11px] text-muted-foreground">
                                {weeklyMode === "trailing7" ? "7d" : "Wk"}{" "}
                                {formatCompactUsd(
                                  weeklyMode === "trailing7"
                                    ? stats.rollingWeeklyPL ?? 0
                                    : stats.calendarWeekPL ?? 0
                                )}
                              </span>
                            </div>

                            <div className="mt-auto w-full space-y-1">
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn(
                                    "h-full transition-all",
                                    utilization > 80 ? "bg-amber-500" : "bg-blue-500"
                                  )}
                                  style={{ width: `${Math.min(utilization, 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="uppercase tracking-wide">Week {idx + 1}</span>
                  <span
                    className={cn(
                      "font-semibold",
                      weekPL > 0
                        ? "text-emerald-400"
                        : weekPL < 0
                        ? "text-rose-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {fmtShortUsd(weekPL)}
                  </span>
                  <div className="ml-2 flex-1 h-1 rounded-full bg-background/40">
                    <div
                      className={cn(
                        "h-1 rounded-full",
                        weekPL > 0 ? "bg-emerald-500" : weekPL < 0 ? "bg-rose-500" : "bg-muted-foreground/60"
                      )}
                      style={{
                        width:
                          maxWeekAbsPL > 0
                            ? `${Math.min(100, (Math.abs(weekPL) / maxWeekAbsPL) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
