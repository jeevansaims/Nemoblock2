"use client";

import { useMemo, useState } from "react";

import {
  analyzeMultiCorrelation,
  CorrelationMethod,
  MultiCorrelationResult,
  StrategySeries,
} from "@/lib/analytics/multi-correlation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface MultiCorrelationPanelProps {
  series: StrategySeries[];
  initialMethod?: CorrelationMethod;
}

const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;

const getCorrelationBadge = (corr: number) => {
  const abs = Math.abs(corr);
  if (abs < 0.3) return { label: "Low", variant: "secondary" as const };
  if (abs < 0.6) return { label: "Moderate", variant: "outline" as const };
  return { label: "High", variant: "destructive" as const };
};

const correlationToColor = (value: number) => {
  const v = Math.max(-1, Math.min(1, value));
  if (v === 0) return "rgba(241, 245, 249, 0.9)"; // soft neutral

  const lerp = (start: number[], end: number[], t: number) =>
    start.map((s, i) => Math.round(s + (end[i] - s) * t));

  if (v < 0) {
    const t = Math.abs(v);
    const start = [226, 234, 245]; // light blue
    const end = [64, 98, 146]; // muted navy
    const [r, g, b] = lerp(start, end, t);
    return `rgba(${r}, ${g}, ${b}, 0.9)`;
  }

  const t = v;
  const start = [249, 227, 227]; // light red
  const end = [199, 59, 59]; // muted deep red
  const [r, g, b] = lerp(start, end, t);
  return `rgba(${r}, ${g}, ${b}, 0.9)`;
};

const scoreBarClass = "h-2 rounded-full bg-muted overflow-hidden";

const renderScoreBar = (score: number) => (
  <div className={scoreBarClass}>
    <div
      className="h-full bg-emerald-500"
      style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
    />
  </div>
);

const WarningList = ({ warnings }: { warnings: string[] }) => {
  if (warnings.length === 0) return null;
  return (
    <Alert variant="destructive" className="space-y-2">
      <AlertTitle>Warnings</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {warnings.map((w, idx) => (
            <li key={idx}>{w}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

const MetricsRow = ({ result }: { result: MultiCorrelationResult }) => {
  const corrBadge = getCorrelationBadge(result.portfolioCorrelation);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Portfolio Correlation</div>
          <Badge variant={corrBadge.variant}>{corrBadge.label}</Badge>
        </div>
        <div className="mt-2 text-2xl font-semibold">
          {formatPercent(result.portfolioCorrelation * 100, 1)}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">Diversification Score</div>
          <Badge variant="secondary">{result.diversificationScore.toFixed(0)} / 100</Badge>
        </div>
        <div className="mt-3">{renderScoreBar(result.diversificationScore)}</div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">Clusters</div>
        <div className="mt-2 text-2xl font-semibold">{result.clusters.length}</div>
      </div>
    </div>
  );
};

const CorrelationMatrixTable = ({ result }: { result: MultiCorrelationResult }) => {
  const { strategies, correlationMatrix } = result;
  if (strategies.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-medium">Multi Correlation Matrix</div>
      <div className="overflow-auto">
        <table className="w-full min-w-max border-collapse text-xs">
          <thead>
            <tr>
              <th className="p-2 text-left text-muted-foreground">Strategy</th>
              {strategies.map((s) => (
                <th
                  key={s}
                  className="min-w-[90px] p-2 text-center align-bottom text-muted-foreground"
                >
                  <div className="origin-bottom-left -rotate-45 whitespace-nowrap text-[11px] leading-4">
                    {s}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {strategies.map((rowStrategy, i) => (
              <tr key={rowStrategy} className="border-t">
                <td className="p-2 text-left font-medium">{rowStrategy}</td>
                {strategies.map((colStrategy, j) => {
                  if (i === j) {
                    return (
                      <td key={colStrategy} className="p-2 text-center text-muted-foreground">
                        —
                      </td>
                    );
                  }
                  const value = correlationMatrix[i][j] ?? 0;
                  const bg = correlationToColor(value);
                  const textClass = Math.abs(value) > 0.6 ? "text-white" : "text-foreground";
                  return (
                    <td key={colStrategy} className="p-1 text-center">
                      <div
                        className={`rounded px-2 py-1 ${textClass}`}
                        style={{ backgroundColor: bg }}
                        title={`${rowStrategy} ↔ ${colStrategy}: ${value.toFixed(2)}`}
                      >
                        {value.toFixed(2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ClusterTable = ({ result }: { result: MultiCorrelationResult }) => {
  if (result.clusters.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">No clusters detected.</div>
      </div>
    );
  }

  const riskBadge = (weightPct: number, meanCorr: number) => {
    if (weightPct > 35 || meanCorr > 0.6) return <Badge variant="destructive">High</Badge>;
    if (weightPct > 25 || meanCorr > 0.4) return <Badge variant="outline">Watch</Badge>;
    return <Badge variant="secondary">Safe</Badge>;
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 text-sm font-medium">Cluster Exposure</div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cluster</TableHead>
            <TableHead>Strategies</TableHead>
            <TableHead>Total Weight</TableHead>
            <TableHead>Mean |corr|</TableHead>
            <TableHead>Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.clusterExposures.map((c) => (
            <TableRow key={c.clusterId}>
              <TableCell className="font-medium">{c.clusterId}</TableCell>
              <TableCell className="whitespace-normal text-xs">
                {c.strategyIds.join(", ")}
              </TableCell>
              <TableCell>{formatPercent(c.totalWeightPct, 1)}</TableCell>
              <TableCell>{c.meanCorrelation.toFixed(2)}</TableCell>
              <TableCell>{riskBadge(c.totalWeightPct, c.meanCorrelation)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const QuickAnalysis = ({
  result,
  method,
}: {
  result: MultiCorrelationResult;
  method: CorrelationMethod;
}) => {
  const { strategies, correlationMatrix } = result;
  const summary = useMemo(() => {
    let strongest = { val: -Infinity, pair: "" };
    let weakest = { val: Infinity, pair: "" };
    let sumAbs = 0;
    let count = 0;

    for (let i = 0; i < strategies.length; i++) {
      for (let j = i + 1; j < strategies.length; j++) {
        const val = correlationMatrix[i][j] ?? 0;
        const pair = `${strategies[i]} ↔ ${strategies[j]}`;
        if (Math.abs(val) > Math.abs(strongest.val)) {
          strongest = { val, pair };
        }
        if (Math.abs(val) < Math.abs(weakest.val)) {
          weakest = { val, pair };
        }
        sumAbs += Math.abs(val);
        count += 1;
      }
    }

    const average = count > 0 ? sumAbs / count : 0;
    return {
      strongest,
      weakest,
      average,
    };
  }, [correlationMatrix, strategies]);

  const formatVal = (v: number) => v.toFixed(2);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-medium">Quick Analysis</div>
          <div className="text-xs text-muted-foreground">
            {strategies.length} strategies · {method === "pearson" ? "Pearson" : "Kendall"} · daily P/L
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Strongest</div>
            <div className="text-lg font-semibold">{formatVal(summary.strongest.val)}</div>
            <div className="text-xs text-muted-foreground whitespace-normal">
              {summary.strongest.pair || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Weakest</div>
            <div className="text-lg font-semibold">{formatVal(summary.weakest.val)}</div>
            <div className="text-xs text-muted-foreground whitespace-normal">
              {summary.weakest.pair || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Average |corr|</div>
            <div className="text-lg font-semibold">{formatVal(summary.average)}</div>
            <div className="text-xs text-muted-foreground">Off-diagonal mean</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function MultiCorrelationPanel({ series, initialMethod }: MultiCorrelationPanelProps) {
  const [method, setMethod] = useState<CorrelationMethod>(initialMethod ?? "pearson");
  const [clusterThreshold, setClusterThreshold] = useState(0.4);

  const result = useMemo(
    () => analyzeMultiCorrelation(series, { method, clusterThreshold }),
    [series, method, clusterThreshold]
  );

  const thresholdDisplay = clusterThreshold.toFixed(2);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-Correlation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium">Correlation Method</div>
            <Select value={method} onValueChange={(val) => setMethod(val as CorrelationMethod)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pearson">Pearson</SelectItem>
                <SelectItem value="kendall">Kendall</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Cluster Threshold</span>
              <span className="text-muted-foreground">{thresholdDisplay}</span>
            </div>
            <Slider
              min={0.2}
              max={0.8}
              step={0.05}
              value={[clusterThreshold]}
              onValueChange={(vals) => setClusterThreshold(vals[0])}
            />
          </div>
        </div>

        <QuickAnalysis result={result} method={method} />

        <MetricsRow result={result} />

        <div className="space-y-4">
          <CorrelationMatrixTable result={result} />
          <ClusterTable result={result} />
        </div>

        <WarningList warnings={result.warnings} />
      </CardContent>
    </Card>
  );
}

export default MultiCorrelationPanel;
