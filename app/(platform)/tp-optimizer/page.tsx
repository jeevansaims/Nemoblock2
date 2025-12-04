"use client";

import { useEffect, useMemo, useState } from "react";

import { MultiTPOptimizer } from "@/components/tp-optimizer/MultiTPOptimizer";
import { MissedProfitDashboard } from "@/components/tp-optimizer/MissedProfitDashboard";
import { StrategyComparison } from "@/components/tp-optimizer/StrategyComparison";
import { StrategyTPSummaryTable } from "@/components/tp-optimizer/StrategyTPSummaryTable";
import { SingleTPStrategyTable } from "@/components/tp-optimizer/SingleTPStrategyTable";
import { CapitalSimPanel } from "@/components/tp-optimizer/CapitalSimPanel";
import { NoActiveBlock } from "@/components/no-active-block";
import { WorkspaceShell } from "@/components/workspace-shell";
import { MissedProfitTrade } from "@/lib/analytics/missed-profit-analyzer";
import { buildStrategyTPSummary } from "@/lib/analytics/strategy-tp-summary";
import { computeSingleTPSummary } from "@/lib/analytics/single-tp-sweep";
import { getTradesByBlockWithOptions } from "@/lib/db";
import { Trade } from "@/lib/models/trade";
import { useBlockStore } from "@/lib/stores/block-store";

export default function TpOptimizerPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  const activeBlock = useBlockStore((state) => {
    const activeBlockId = state.activeBlockId;
    return activeBlockId
      ? state.blocks.find((block) => block.id === activeBlockId)
      : null;
  });
  const isInitialized = useBlockStore((state) => state.isInitialized);
  const loadBlocks = useBlockStore((state) => state.loadBlocks);

  useEffect(() => {
    if (!isInitialized) {
      loadBlocks().catch(console.error);
    }
  }, [isInitialized, loadBlocks]);

  useEffect(() => {
    async function fetchTrades() {
      if (!activeBlock) {
        setTrades([]);
        return;
      }
      setLoading(true);
      try {
        const fetched = await getTradesByBlockWithOptions(activeBlock.id);
        setTrades(fetched);
      } catch (err) {
        console.error("Failed to fetch trades for TP/SL optimizer", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, [activeBlock]);

  const missedProfitTrades = useMemo<MissedProfitTrade[]>(() => {
    return trades.map((t, idx) => {
      const premiumUsed = Math.abs(t.premium || 0);
      const plDollar = t.pl || 0;
      const plPercent =
        premiumUsed > 0 ? (plDollar / premiumUsed) * 100 : 0;
      const maxProfitPct =
        premiumUsed > 0 && typeof t.maxProfit === "number"
          ? (t.maxProfit / premiumUsed) * 100
          : 0;
      const maxLossPct =
        premiumUsed > 0 && typeof t.maxLoss === "number"
          ? (t.maxLoss / premiumUsed) * 100
          : undefined;

      return {
        id: t.timeOpened ? `${t.dateOpened}-${t.timeOpened}` : idx,
        premiumUsed,
        plDollar,
        plPercent,
        maxProfitPct,
        maxLossPct,
        strategyName: t.strategy,
        openedOn: t.dateOpened,
        closedOn: t.dateClosed,
      };
    });
  }, [trades]);

  const tpSummaryRows = useMemo(
    () => buildStrategyTPSummary(missedProfitTrades),
    [missedProfitTrades]
  );

  const singleTPSummary = useMemo(
    () =>
      computeSingleTPSummary(
        missedProfitTrades.map((t) => ({
          id: t.id,
          strategyName: t.strategyName || "Unknown",
          premiumUsed: t.premiumUsed,
          pl: t.plDollar ?? (t.plPercent / 100) * Math.abs(t.premiumUsed || 0),
          plPercent: t.plPercent,
          maxProfitPct: t.maxProfitPct,
        }))
      ),
    [missedProfitTrades]
  );

  if (!activeBlock) {
    return <NoActiveBlock />;
  }

  return (
    <WorkspaceShell
      title="TP/SL Optimizer (MAE/MFE)"
      label="Latest"
      description="Analyze excursion-based exits and missed profit opportunities."
    >
      {loading ? (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
          <p className="text-muted-foreground">Loading trades...</p>
        </div>
      ) : missedProfitTrades.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No trades available for this block yet.
        </div>
      ) : (
        <div className="space-y-6">
          <MissedProfitDashboard trades={missedProfitTrades} />
          <MultiTPOptimizer trades={missedProfitTrades} />
          <StrategyComparison trades={missedProfitTrades} />
          <StrategyTPSummaryTable rows={tpSummaryRows} />
          <SingleTPStrategyTable rows={singleTPSummary} />
          <CapitalSimPanel trades={missedProfitTrades} />
        </div>
      )}
    </WorkspaceShell>
  );
}
