"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";

import { NoActiveBlock } from "@/components/no-active-block";
import MultiCorrelationPanel from "@/components/multi-correlation/MultiCorrelationPanel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getBlock, getTradesByBlockWithOptions } from "@/lib/db";
import { StrategySeries } from "@/lib/analytics/multi-correlation";
import { Trade } from "@/lib/models/trade";
import { useBlockStore } from "@/lib/stores/block-store";

const buildSeries = (trades: Trade[]): StrategySeries[] => {
  const byStrategy = new Map<
    string,
    {
      totals: Map<string, { pl: number; margin: number }>;
    }
  >();

  trades.forEach((t) => {
    const strategy = t.strategy || "Unknown";
    const dateKey = format(t.dateOpened, "yyyy-MM-dd");
    if (!byStrategy.has(strategy)) {
      byStrategy.set(strategy, { totals: new Map() });
    }
    const entry = byStrategy.get(strategy)!;
    const prev = entry.totals.get(dateKey) ?? { pl: 0, margin: 0 };
    entry.totals.set(dateKey, {
      pl: prev.pl + t.pl,
      margin: prev.margin + (t.marginReq ?? 0),
    });
  });

  const strategyKeys = Array.from(byStrategy.keys());
  const defaultWeight = strategyKeys.length > 0 ? 100 / strategyKeys.length : 0;

  return strategyKeys.map((key) => {
    const totals = byStrategy.get(key)!.totals;
    const points = Array.from(totals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({
        date,
        pl: v.pl,
        margin: v.margin,
      }));

    return {
      id: key,
      name: key,
      weightPct: defaultWeight,
      points,
    };
  });
};

export default function MultiCorrelationPage() {
  const activeBlockId = useBlockStore(
    (state) => state.blocks.find((b) => b.isActive)?.id
  );
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrades() {
      if (!activeBlockId) {
        setTrades([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const processedBlock = await getBlock(activeBlockId);
        const combineLegGroups =
          processedBlock?.analysisConfig?.combineLegGroups ?? false;
        const loadedTrades = await getTradesByBlockWithOptions(activeBlockId, {
          combineLegGroups,
        });
        setTrades(loadedTrades);
      } catch (error) {
        console.error("Failed to load trades:", error);
      } finally {
        setLoading(false);
      }
    }

    loadTrades();
  }, [activeBlockId]);

  const series = useMemo(() => buildSeries(trades), [trades]);

  if (!activeBlockId) {
    return <NoActiveBlock />;
  }

  return (
    <WorkspaceShell
      title="Multi-Correlation"
      label="New"
      description="Analyze correlation clusters, exposures, and diversification across strategies."
    >
      {loading ? (
        <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed">
          <p className="text-muted-foreground">Loading trades...</p>
        </div>
      ) : (
        <MultiCorrelationPanel series={series} />
      )}
    </WorkspaceShell>
  );
}
