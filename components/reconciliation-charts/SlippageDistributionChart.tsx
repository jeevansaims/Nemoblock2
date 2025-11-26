"use client"

import { ChartWrapper, createHistogramLayout } from "@/components/performance-charts/chart-wrapper"
import { AlignedTradeSet, NormalizedTrade } from "@/lib/services/trade-reconciliation"
import type { PlotData } from "plotly.js"

export interface SlippageDistributionData {
  slippages: number[]
  positive: number[]
  neutral: number[]
  negative: number[]
  mean: number
  median: number
  p10: number
  p25: number
  p75: number
  p90: number
  count: number
  positiveCount: number
  neutralCount: number
  negativeCount: number
  min: number
  max: number
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function getPercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  const index = (percentile / 100) * (values.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return values[lower]
  const weight = index - lower
  return values[lower] * (1 - weight) + values[upper] * weight
}

export function computeSlippageDistribution(
  alignment: AlignedTradeSet,
  normalizeTo1Lot = false,
): SlippageDistributionData | null {
  const matchedPairs = alignment.sessions.flatMap(session =>
    session.items
      .filter(item =>
        item.isPaired &&
        item.backtested &&
        item.reported &&
        item.includedBacktested &&
        item.includedReported
      )
      .map(item => ({
        backtested: item.backtested!,
        reported: item.reported!,
      }))
  )

  if (matchedPairs.length === 0) {
    return null
  }

  const normalizePremium = (trade: NormalizedTrade) =>
    normalizeTo1Lot ? trade.premiumPerContract : trade.totalPremium

  const slippages = matchedPairs.map(
    pair => normalizePremium(pair.reported) - normalizePremium(pair.backtested)
  )

  const sorted = [...slippages].sort((a, b) => a - b)
  const mean = slippages.reduce((sum, val) => sum + val, 0) / slippages.length
  const median = (() => {
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
  })()

  const positive = slippages.filter((s) => s > 0)
  const negative = slippages.filter((s) => s < 0)
  const neutral = slippages.filter((s) => s === 0)

  return {
    slippages,
    positive,
    neutral,
    negative,
    mean,
    median,
    p10: getPercentile(sorted, 10),
    p25: getPercentile(sorted, 25),
    p75: getPercentile(sorted, 75),
    p90: getPercentile(sorted, 90),
    count: slippages.length,
    positiveCount: positive.length,
    neutralCount: neutral.length,
    negativeCount: negative.length,
    min: Math.min(...slippages),
    max: Math.max(...slippages),
  }
}

interface SlippageDistributionChartProps {
  data: SlippageDistributionData | null
  normalizeTo1Lot?: boolean
  className?: string
}

export function SlippageDistributionChart({
  data,
  normalizeTo1Lot = false,
  className,
}: SlippageDistributionChartProps) {
  if (!data || data.count === 0) {
    return (
      <div className={className}>
        <div className="text-center p-8 text-muted-foreground">
          No matched trades available for slippage analysis
        </div>
      </div>
    )
  }

  const { slippages, positive, neutral, negative, mean, median, min, max } = data

  const maxMagnitude = Math.max(Math.abs(max), Math.abs(min))
  const rangePadding = maxMagnitude === 0 ? 1 : maxMagnitude * 0.15
  const xMin = min - rangePadding
  const xMax = max + rangePadding

  const binCount = Math.min(40, Math.max(10, Math.ceil(Math.sqrt(slippages.length))))
  const binSize = xMax - xMin === 0 ? 1 : (xMax - xMin) / binCount
  const xbins = {
    start: xMin,
    end: xMax,
    size: binSize,
  }

  const traces: Partial<PlotData>[] = []

  if (negative.length > 0) {
    traces.push({
      x: negative,
      type: "histogram",
      name: "Negative (worse execution)",
      marker: { color: "#ef4444" },
      opacity: 0.75,
      xbins,
      hovertemplate:
        "<b>Slippage:</b> $%{x:.2f}<br>" +
        "<b>Trades:</b> %{y}<br>" +
        "<extra></extra>",
    })
  }

  if (positive.length > 0) {
    traces.push({
      x: positive,
      type: "histogram",
      name: "Positive (better execution)",
      marker: { color: "#10b981" },
      opacity: 0.75,
      xbins,
      hovertemplate:
        "<b>Slippage:</b> $%{x:.2f}<br>" +
        "<b>Trades:</b> %{y}<br>" +
        "<extra></extra>",
    })
  }

  if (neutral.length > 0) {
    traces.push({
      x: neutral,
      type: "histogram",
      name: "Neutral",
      marker: { color: "#6b7280" },
      opacity: 0.75,
      xbins,
      hovertemplate:
        "<b>Slippage:</b> $%{x:.2f}<br>" +
        "<b>Trades:</b> %{y}<br>" +
        "<extra></extra>",
    })
  }

  traces.push({
    x: [mean, mean],
    y: [0, 1],
    type: "scatter",
    mode: "lines",
    line: { color: "#111827", width: 2, dash: "dash" },
    name: `Mean: ${currencyFormatter.format(mean)}`,
    showlegend: true,
    yaxis: "y2",
    hovertemplate: `<b>Mean Slippage</b><br>${currencyFormatter.format(mean)}<extra></extra>`,
  })

  traces.push({
    x: [median, median],
    y: [0, 1],
    type: "scatter",
    mode: "lines",
    line: { color: "#1f2937", width: 2, dash: "dot" },
    name: `Median: ${currencyFormatter.format(median)}`,
    showlegend: true,
    yaxis: "y2",
    hovertemplate: `<b>Median Slippage</b><br>${currencyFormatter.format(median)}<extra></extra>`,
  })

  if (xMin < 0 && xMax > 0) {
    traces.push({
      x: [0, 0],
      y: [0, 1],
      type: "scatter",
      mode: "lines",
      line: { color: "#6b7280", width: 1.5 },
      name: "Zero",
      showlegend: true,
      yaxis: "y2",
      hovertemplate: "<b>Zero Slippage</b><extra></extra>",
    })
  }

  const layout = {
    ...createHistogramLayout("", "Slippage ($)", "Number of Trades"),
    xaxis: {
      title: { text: "Slippage ($)" },
      showgrid: true,
      range: [xMin, xMax],
      zeroline: true,
      zerolinewidth: 2,
    },
    yaxis: {
      title: { text: "Number of Trades" },
      showgrid: true,
    },
    yaxis2: {
      overlaying: "y" as const,
      side: "right" as const,
      showgrid: false,
      showticklabels: false,
      range: [0, 1],
    },
    showlegend: true,
    legend: {
      orientation: "h" as const,
      yanchor: "bottom" as const,
      y: 1.02,
      xanchor: "right" as const,
      x: 1,
      bgcolor: "rgba(0,0,0,0)",
    },
    bargap: 0.05,
    barmode: "overlay" as const,
  }

  return (
    <div className={className}>
      <ChartWrapper
        title="Slippage Distribution"
        description={`Histogram of slippage for ${data.count} matched trades (${normalizeTo1Lot ? "per contract" : "per trade"})`}
        tooltip={{
          flavor: "Distribution of slippage across matched trades",
          detailed: "Slippage equals reported premium minus backtested premium. Positive values (green) indicate better execution than expected, negative values (red) indicate worse."
        }}
        data={traces}
        layout={layout}
        style={{ height: "320px" }}
      />
    </div>
  )
}
