"use client";

import { MissedProfitDashboard } from "@/components/tp-optimizer/MissedProfitDashboard";
import { WorkspaceShell } from "@/components/workspace-shell";
import { MissedProfitTrade } from "@/lib/analytics/missed-profit-analyzer";

// TODO: replace this sample data with real trades from CSV upload/store.
const sampleTrades: MissedProfitTrade[] = [
  {
    id: "t1",
    premiumUsed: 200,
    plDollar: 100,
    plPercent: 50,
    maxProfitPct: 120,
    maxLossPct: -50,
    strategyName: "Ric Intraday Swan",
    openedOn: "2025-11-06",
  },
  {
    id: "t2",
    premiumUsed: 450,
    plDollar: -90,
    plPercent: -20,
    maxProfitPct: 80,
    maxLossPct: -60,
    strategyName: "ORB Bfly",
    openedOn: "2025-11-05",
  },
  {
    id: "t3",
    premiumUsed: 350,
    plDollar: 140,
    plPercent: 40,
    maxProfitPct: 140,
    strategyName: "5/40 VIX Opening",
    openedOn: "2025-11-04",
  },
  {
    id: "t4",
    premiumUsed: 275,
    plDollar: 55,
    plPercent: 20,
    maxProfitPct: 90,
    strategyName: "Ric Intraday Swan",
    openedOn: "2025-11-03",
  },
  {
    id: "t5",
    premiumUsed: 180,
    plDollar: 9,
    plPercent: 5,
    maxProfitPct: 60,
    strategyName: "Calendar Fade",
    openedOn: "2025-11-02",
  },
];

export default function TpOptimizerPage() {
  return (
    <WorkspaceShell
      title="TP/SL Optimizer (MAE/MFE)"
      label="Latest"
      description="Analyze excursion-based exits and missed profit opportunities."
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          This is an early draft using sample data. Wire your trade feed (premium, P/L%, MFE%)
          into the dashboard to see your missed profit stats by trade and strategy.
        </p>
        <MissedProfitDashboard trades={sampleTrades} />
      </div>
    </WorkspaceShell>
  );
}
