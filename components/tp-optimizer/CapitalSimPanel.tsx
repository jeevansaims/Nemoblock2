"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { MissedProfitTrade } from "@/lib/analytics/missed-profit-analyzer";
import { simulateEquityCurve } from "@/lib/analytics/capital-simulator";
import { Trade } from "@/lib/models/trade";
import { cn } from "@/lib/utils";

interface CapitalSimPanelProps {
  trades: MissedProfitTrade[];
}

const fmtUsd = (v: number) =>
  `${v >= 0 ? "$" : "-$"}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export function CapitalSimPanel({ trades }: CapitalSimPanelProps) {
  type ExtendedTrade = MissedProfitTrade & {
    fundsAtClose?: number;
    numContracts?: number;
    marginReq?: number;
    premium?: number;
  };

  const [startingCapital, setStartingCapital] = useState(() => {
    if (trades.length === 0) return 100_000;
    const sorted = [...trades].sort((a, b) => {
      const da = (a.closedOn as Date) || (a.openedOn as Date);
      const db = (b.closedOn as Date) || (b.openedOn as Date);
      return new Date(da).getTime() - new Date(db).getTime();
    });
    const first = sorted[0];
    const firstFunds = (first as ExtendedTrade).fundsAtClose;
    return Math.max(0, firstFunds ?? 100_000);
  });
  const [allocationPct, setAllocationPct] = useState(4);
  const [basis, setBasis] = useState<"premium" | "margin">("premium");
  const [withdrawalMode, setWithdrawalMode] = useState<
    "none" | "percent" | "fixed" | "reset"
  >("none");
  const [withdrawalPct, setWithdrawalPct] = useState(30);
  const [fixedWithdrawal, setFixedWithdrawal] = useState(1000);
  const [withdrawOnlyIfProfitable, setWithdrawOnlyIfProfitable] = useState(true);
  const [normalizeToOneLot, setNormalizeToOneLot] = useState(false);

  const result = useMemo(
    () =>
      simulateEquityCurve(
        trades.map(
          (t): Trade => {
            const extended = t as ExtendedTrade;
            const numContracts = extended.numContracts ?? 1;
            return {
              dateOpened: new Date(t.openedOn || new Date()),
              timeOpened: "",
              openingPrice: 0,
              legs: "",
              premium: extended.premium ?? t.premiumUsed,
              pl: t.plDollar,
              numContracts,
              fundsAtClose: extended.fundsAtClose ?? 0,
              marginReq: extended.marginReq ?? t.premiumUsed,
              strategy: t.strategyName || "Unknown",
              closingPrice: undefined,
              dateClosed: t.closedOn ? new Date(t.closedOn) : undefined,
              timeClosed: undefined,
              avgClosingCost: undefined,
              reasonForClose: undefined,
              premiumPrecision: "dollars",
              closingShortLongRatio: undefined,
              closingCommissionsFees: 0,
              openingCommissionsFees: 0,
              openingShortLongRatio: 0,
              closingVix: undefined,
              openingVix: undefined,
              gap: undefined,
              movement: undefined,
              maxProfit: undefined,
              maxLoss: undefined,
            };
          }
        ),
        {
          startingCapital,
          allocationPct: allocationPct / 100,
          basis,
          withdrawalMode,
          withdrawalPct: withdrawalPct / 100,
          fixedAmount: fixedWithdrawal,
          withdrawOnlyIfProfitable,
          normalizeToOneLot,
        }
      ),
    [
      trades,
      startingCapital,
      allocationPct,
      basis,
      withdrawalMode,
      withdrawalPct,
      fixedWithdrawal,
      withdrawOnlyIfProfitable,
      normalizeToOneLot,
    ]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capital Path Simulator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Starting capital</Label>
            <Input
              type="number"
              value={startingCapital}
              onChange={(e) => setStartingCapital(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-2">
            <Label>Allocation % of equity per trade</Label>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[allocationPct]}
              onValueChange={([v]) => setAllocationPct(v)}
            />
            <div className="text-sm text-muted-foreground">{allocationPct}%</div>
          </div>
          <div className="space-y-2">
            <Label>Basis</Label>
            <div className="flex gap-2">
              <Button
                variant={basis === "premium" ? "default" : "outline"}
                size="sm"
                onClick={() => setBasis("premium")}
              >
                Premium
              </Button>
              <Button
                variant={basis === "margin" ? "default" : "outline"}
                size="sm"
                onClick={() => setBasis("margin")}
              >
                Margin
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Withdrawal mode</Label>
            <div className="flex flex-wrap gap-2">
              {(["none", "percent", "fixed", "reset"] as const).map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={withdrawalMode === mode ? "default" : "outline"}
                  onClick={() => setWithdrawalMode(mode)}
                >
                  {mode === "none"
                    ? "None"
                    : mode === "percent"
                    ? "Percent"
                    : mode === "fixed"
                    ? "Fixed $"
                    : "Reset to start"}
                </Button>
              ))}
            </div>
            {withdrawalMode === "percent" && (
              <>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[withdrawalPct]}
                  onValueChange={([v]) => setWithdrawalPct(v)}
                />
                <div className="text-sm text-muted-foreground">{withdrawalPct}%</div>
              </>
            )}
            {withdrawalMode === "fixed" && (
              <Input
                type="number"
                value={fixedWithdrawal}
                onChange={(e) => setFixedWithdrawal(Number(e.target.value) || 0)}
              />
            )}
            <div className="flex items-center gap-2">
              <Switch
                checked={withdrawOnlyIfProfitable}
                onCheckedChange={setWithdrawOnlyIfProfitable}
              />
              <span className="text-sm text-muted-foreground">
                Withdraw only if profitable
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Normalize to 1-lot</Label>
            <div className="flex items-center gap-2">
              <Switch
                checked={normalizeToOneLot}
                onCheckedChange={setNormalizeToOneLot}
              />
              <span className="text-sm text-muted-foreground">
                Divide P/L and basis by contracts
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Metric label="Ending Capital" value={fmtUsd(result.endingCapital)} />
          <Metric
            label="Portfolio P/L"
            value={fmtUsd(result.portfolioPL)}
            tone={result.portfolioPL >= 0 ? "positive" : "negative"}
          />
          <Metric
            label="Total Withdrawn"
            value={fmtUsd(result.totalWithdrawals)}
            tone="neutral"
          />
          <Metric
            label="Max Drawdown"
            value={`${result.maxDrawdownPct.toFixed(1)}%`}
            tone="negative"
          />
          <Metric label="CAGR" value={`${result.cagrPct.toFixed(1)}%`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
      ? "text-rose-400"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={cn("text-lg font-semibold", toneClass)}>{value}</div>
    </div>
  );
}
