"use client"

import React, { useEffect, useMemo, useState } from "react"
import { ChartWrapper } from "./chart-wrapper"
import { usePerformanceStore } from "@/lib/stores/performance-store"
import type { Layout, PlotData } from "plotly.js"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import {
  NORMALIZATION_BASES,
  type MFEMAEDataPoint,
  type NormalizationBasis
} from "@/lib/calculations/mfe-mae"
import type { EfficiencyBasis } from "@/lib/metrics/trade-efficiency"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AxisValueFormat =
  | { type: "currency"; maximumFractionDigits?: number }
  | { type: "percent"; maximumFractionDigits?: number }
  | { type: "number"; maximumFractionDigits?: number }

interface AxisOption {
  value: string
  label: string
  axisLabel: string
  format: AxisValueFormat
  accessor: (point: MFEMAEDataPoint) => number | null
}

const normalizationBasisLabels: Record<NormalizationBasis, string> = {
  premium: "Collected Premium",
  margin: "Margin Requirement"
}

const efficiencyBasisLabels: Record<EfficiencyBasis, string> = {
  premium: "Collected Premium",
  maxProfit: "Maximum Profit",
  margin: "Margin Requirement",
  unknown: "Unknown Basis"
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function formatAxisValue(value: number, format: AxisValueFormat): string {
  if (!Number.isFinite(value)) {
    return "N/A"
  }

  switch (format.type) {
    case "currency": {
      const formatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: format.maximumFractionDigits ?? 0
      })
      return formatter.format(value)
    }
    case "percent": {
      const digits = format.maximumFractionDigits ?? 1
      return `${value.toFixed(digits)}%`
    }
    case "number":
    default: {
      const formatter = new Intl.NumberFormat(undefined, {
        maximumFractionDigits: format.maximumFractionDigits ?? 2
      })
      return formatter.format(value)
    }
  }
}

const rawCurrencyFormat: AxisValueFormat = { type: "currency", maximumFractionDigits: 0 }
const preciseCurrencyFormat: AxisValueFormat = { type: "currency", maximumFractionDigits: 2 }
const percentFormat: AxisValueFormat = { type: "percent", maximumFractionDigits: 1 }
const ratioFormat: AxisValueFormat = { type: "number", maximumFractionDigits: 2 }
const integerFormat: AxisValueFormat = { type: "number", maximumFractionDigits: 0 }
const decimalFormat: AxisValueFormat = { type: "number", maximumFractionDigits: 2 }

const preferredXAxisOrder = [
  "mae_percent_premium",
  "mae_percent_margin",
  "mae"
]

const preferredYAxisOrder = [
  "mfe_percent_premium",
  "mfe_percent_margin",
  "mfe"
]

interface PresetConfig {
  id: string
  label: string
  description: string
  xMetric: string
  yMetric: string
  // Additional layout customizations per preset
  layoutCustomizations?: Partial<Layout>
  // Special trace handling (e.g., reference lines, zones)
  addSpecialTraces?: (points: { point: MFEMAEDataPoint; xValue: number; yValue: number }[], xMetric: string, yMetric: string) => Partial<PlotData>[]
}

interface DriftBucketConfig {
  label: string
  min: number
  max: number
}

const SLR_RATIO_BUCKETS: DriftBucketConfig[] = [
  { label: "< 0.50×", min: 0, max: 0.5 },
  { label: "0.50× – 0.75×", min: 0.5, max: 0.75 },
  { label: "0.75× – 1.00×", min: 0.75, max: 1 },
  { label: "1.00× – 1.25×", min: 1, max: 1.25 },
  { label: "1.25× – 1.50×", min: 1.25, max: 1.5 },
  { label: "1.50× – 2.00×", min: 1.5, max: 2 },
  { label: "≥ 2.00×", min: 2, max: Infinity }
]

const SLR_PERCENT_BUCKETS: DriftBucketConfig[] = [
  { label: "≤ -50%", min: -Infinity, max: -50 },
  { label: "-50% to -30%", min: -50, max: -30 },
  { label: "-30% to -10%", min: -30, max: -10 },
  { label: "-10% to 0%", min: -10, max: 0 },
  { label: "0% to +10%", min: 0, max: 10 },
  { label: "+10% to +30%", min: 10, max: 30 },
  { label: "+30% to +60%", min: 30, max: 60 },
  { label: "≥ +60%", min: 60, max: Infinity }
]

const PRESETS: PresetConfig[] = [
  {
    id: "mfe-vs-mae",
    label: "MFE vs MAE",
    description: "Classic excursion analysis: compare maximum favorable vs adverse excursions",
    xMetric: "mae_percent_premium",
    yMetric: "mfe_percent_premium",
  },
  {
    id: "mae-vs-pl",
    label: "MAE vs P&L",
    description: "Risk taken vs reward captured: identify efficient trade outcomes",
    xMetric: "mae_percent_premium",
    yMetric: "pl_percent_premium",
    layoutCustomizations: {
      shapes: [
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 0,
          y1: 0,
          line: {
            color: '#6b7280',
            width: 1,
            dash: 'dot'
          }
        }
      ]
    }
  },
  {
    id: "profit-capture-timeline",
    label: "Profit Capture Timeline",
    description: "Track how well you captured peak profits across your trading history",
    xMetric: "trade_number",
    yMetric: "profit_capture",
    addSpecialTraces: (points) => {
      const profitCaptureValues = points
        .map(p => p.point.profitCapturePercent)
        .filter((v): v is number => v !== undefined && isFinite(v))

      if (profitCaptureValues.length === 0) return []

      const avgProfitCapture = profitCaptureValues.reduce((sum, v) => sum + v, 0) / profitCaptureValues.length
      const tradeNumbers = points.map(p => p.point.tradeNumber)
      const minTrade = Math.min(...tradeNumbers)
      const maxTrade = Math.max(...tradeNumbers)

      return [
        {
          x: [minTrade, maxTrade],
          y: [100, 100],
          type: 'scatter',
          mode: 'lines',
          name: '100% Capture',
          line: { color: '#6b7280', width: 1, dash: 'dot' },
          hoverinfo: 'skip',
          showlegend: true
        },
        {
          x: [minTrade, maxTrade],
          y: [avgProfitCapture, avgProfitCapture],
          type: 'scatter',
          mode: 'lines',
          name: `Average (${avgProfitCapture.toFixed(1)}%)`,
          line: { color: '#3b82f6', width: 2, dash: 'dash' },
          hoverinfo: 'skip',
          showlegend: true
        }
      ]
    },
    layoutCustomizations: {
      shapes: [
        {
          type: 'rect',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 80,
          y1: 120,
          fillcolor: 'rgba(34, 197, 94, 0.1)',
          line: { width: 0 },
          layer: 'below'
        }
      ]
    }
  },
  {
    id: "excursion-vs-premium",
    label: "Excursions vs Premium",
    description: "Analyze how excursions scale with collected premium",
    xMetric: "premium",
    yMetric: "mfe",
  },
  {
    id: "excursion-vs-margin",
    label: "Excursions vs Margin",
    description: "Evaluate excursion sizes relative to margin requirements",
    xMetric: "margin",
    yMetric: "mae",
  },
  {
    id: "excursion-vs-vix",
    label: "Excursions vs VIX",
    description: "Discover how volatility regime affects trade excursions",
    xMetric: "opening_vix",
    yMetric: "mae_percent_premium",
  },
  {
    id: "slr-drift-vs-return",
    label: "S/L Drift vs Return",
    description: "See how changes in the short/long ratio relate to trade outcomes",
    xMetric: "slr_ratio_change",
    yMetric: "pl_percent_premium",
    addSpecialTraces: (points) => {
      if (points.length === 0) return []

      const minY = Math.min(...points.map(entry => entry.yValue))
      const maxY = Math.max(...points.map(entry => entry.yValue))

      return [
        {
          x: [1, 1],
          y: [minY, maxY],
          type: "scatter",
          mode: "lines",
          name: "No Drift (1.0x)",
          line: { color: "#6b7280", width: 1, dash: "dash" },
          hoverinfo: "skip",
          showlegend: true
        }
      ]
    },
    layoutCustomizations: {
      shapes: [
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: 0,
          x1: 1,
          y0: 0,
          y1: 1,
          fillcolor: "rgba(248, 113, 113, 0.08)",
          line: { width: 0 },
          layer: "below"
        },
        {
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: 1,
          x1: 2,
          y0: 0,
          y1: 1,
          fillcolor: "rgba(134, 239, 172, 0.08)",
          line: { width: 0 },
          layer: "below"
        }
      ]
    }
  }
]

export function MFEMAEScatterChart({ className }: { className?: string }) {
  const { data } = usePerformanceStore()
  const [selectedPreset, setSelectedPreset] = useState<string>("mfe-vs-mae")
  const [xMetric, setXMetric] = useState<string | null>(null)
  const [yMetric, setYMetric] = useState<string | null>(null)

  const axisOptions = useMemo<AxisOption[]>(() => {
    if (!data?.mfeMaeData || data.mfeMaeData.length === 0) {
      return []
    }

    const options: AxisOption[] = []
    const addOption = (option: AxisOption) => {
      const hasValue = data.mfeMaeData?.some(point => {
        const value = option.accessor(point)
        return isFiniteNumber(value)
      })

      if (hasValue) {
        options.push(option)
      }
    }

    const makeNormalizedAccessor = (
      basis: NormalizationBasis,
      key: "maePercent" | "mfePercent" | "plPercent"
    ) => (point: MFEMAEDataPoint) => {
      const metrics = point.normalizedBy?.[basis]
      if (!metrics) return null
      return metrics[key]
    }

    NORMALIZATION_BASES.forEach(basis => {
      const label = normalizationBasisLabels[basis]
      addOption({
        value: `mae_percent_${basis}`,
        label: `MAE (% of ${label})`,
        axisLabel: `Maximum Adverse Excursion (% of ${label})`,
        format: percentFormat,
        accessor: makeNormalizedAccessor(basis, "maePercent")
      })
      addOption({
        value: `mfe_percent_${basis}`,
        label: `MFE (% of ${label})`,
        axisLabel: `Maximum Favorable Excursion (% of ${label})`,
        format: percentFormat,
        accessor: makeNormalizedAccessor(basis, "mfePercent")
      })
      addOption({
        value: `pl_percent_${basis}`,
        label: `P&L (% of ${label})`,
        axisLabel: `P&L (% of ${label})`,
        format: percentFormat,
        accessor: makeNormalizedAccessor(basis, "plPercent")
      })
    })

    addOption({
      value: "mae",
      label: "MAE ($)",
      axisLabel: "Maximum Adverse Excursion ($)",
      format: rawCurrencyFormat,
      accessor: point => point.mae ?? null
    })

    addOption({
      value: "mfe",
      label: "MFE ($)",
      axisLabel: "Maximum Favorable Excursion ($)",
      format: rawCurrencyFormat,
      accessor: point => point.mfe ?? null
    })

    addOption({
      value: "pl",
      label: "P&L ($)",
      axisLabel: "P&L ($)",
      format: rawCurrencyFormat,
      accessor: point => point.pl ?? null
    })

    addOption({
      value: "trade_number",
      label: "Trade Number",
      axisLabel: "Trade Number",
      format: integerFormat,
      accessor: point => point.tradeNumber ?? null
    })

    addOption({
      value: "profit_capture",
      label: "Profit Capture (%)",
      axisLabel: "Profit Capture (%)",
      format: percentFormat,
      accessor: point => point.profitCapturePercent ?? null
    })

    addOption({
      value: "excursion_ratio",
      label: "Excursion Ratio (MFE/MAE)",
      axisLabel: "Excursion Ratio (MFE/MAE)",
      format: ratioFormat,
      accessor: point => point.excursionRatio ?? null
    })

    addOption({
      value: "premium",
      label: "Collected Premium ($)",
      axisLabel: "Collected Premium ($)",
      format: rawCurrencyFormat,
      accessor: point => point.premium ?? null
    })

    addOption({
      value: "margin",
      label: "Margin Requirement ($)",
      axisLabel: "Margin Requirement ($)",
      format: rawCurrencyFormat,
      accessor: point => point.marginReq ?? null
    })

    addOption({
      value: "denominator",
      label: "Normalization Denominator ($)",
      axisLabel: "Normalization Denominator ($)",
      format: rawCurrencyFormat,
      accessor: point => point.denominator ?? null
    })

    addOption({
      value: "opening_price",
      label: "Opening Price ($)",
      axisLabel: "Opening Price ($)",
      format: preciseCurrencyFormat,
      accessor: point => point.openingPrice ?? null
    })

    addOption({
      value: "closing_price",
      label: "Closing Price ($)",
      axisLabel: "Closing Price ($)",
      format: preciseCurrencyFormat,
      accessor: point => point.closingPrice ?? null
    })

    addOption({
      value: "avg_closing_cost",
      label: "Average Closing Cost ($)",
      axisLabel: "Average Closing Cost ($)",
      format: preciseCurrencyFormat,
      accessor: point => point.avgClosingCost ?? null
    })

    addOption({
      value: "funds_at_close",
      label: "Funds at Close ($)",
      axisLabel: "Funds at Close ($)",
      format: rawCurrencyFormat,
      accessor: point => point.fundsAtClose ?? null
    })

    addOption({
      value: "opening_commissions",
      label: "Opening Commissions & Fees ($)",
      axisLabel: "Opening Commissions & Fees ($)",
      format: preciseCurrencyFormat,
      accessor: point => point.openingCommissionsFees ?? null
    })

    addOption({
      value: "closing_commissions",
      label: "Closing Commissions & Fees ($)",
      axisLabel: "Closing Commissions & Fees ($)",
      format: preciseCurrencyFormat,
      accessor: point => point.closingCommissionsFees ?? null
    })

    addOption({
      value: "num_contracts",
      label: "Number of Contracts",
      axisLabel: "Number of Contracts",
      format: integerFormat,
      accessor: point => point.numContracts ?? null
    })

    addOption({
      value: "opening_short_long",
      label: "Opening Short/Long Ratio",
      axisLabel: "Opening Short/Long Ratio",
      format: ratioFormat,
      accessor: point => point.openingShortLongRatio ?? null
    })

    addOption({
      value: "closing_short_long",
      label: "Closing Short/Long Ratio",
      axisLabel: "Closing Short/Long Ratio",
      format: ratioFormat,
      accessor: point => point.closingShortLongRatio ?? null
    })

    addOption({
      value: "slr_ratio_change",
      label: "S/L Ratio Drift (Close ÷ Open)",
      axisLabel: "Short/Long Ratio Drift (Close ÷ Open)",
      format: ratioFormat,
      accessor: point => point.shortLongRatioChange ?? null
    })

    addOption({
      value: "slr_ratio_change_pct",
      label: "S/L Ratio Drift (% Change)",
      axisLabel: "Short/Long Ratio Drift (% Change)",
      format: percentFormat,
      accessor: point => point.shortLongRatioChangePct ?? null
    })

    addOption({
      value: "opening_vix",
      label: "Opening VIX",
      axisLabel: "Opening VIX",
      format: decimalFormat,
      accessor: point => point.openingVix ?? null
    })

    addOption({
      value: "closing_vix",
      label: "Closing VIX",
      axisLabel: "Closing VIX",
      format: decimalFormat,
      accessor: point => point.closingVix ?? null
    })

    addOption({
      value: "gap",
      label: "Gap ($)",
      axisLabel: "Gap ($)",
      format: rawCurrencyFormat,
      accessor: point => point.gap ?? null
    })

    addOption({
      value: "movement",
      label: "Underlying Movement ($)",
      axisLabel: "Underlying Movement ($)",
      format: rawCurrencyFormat,
      accessor: point => point.movement ?? null
    })

    addOption({
      value: "max_profit",
      label: "Modeled Max Profit ($)",
      axisLabel: "Modeled Max Profit ($)",
      format: rawCurrencyFormat,
      accessor: point => point.maxProfit ?? null
    })

    addOption({
      value: "max_loss",
      label: "Modeled Max Loss ($)",
      axisLabel: "Modeled Max Loss ($)",
      format: rawCurrencyFormat,
      accessor: point => point.maxLoss ?? null
    })

    return options
  }, [data])

  // Available presets based on data
  const availablePresets = useMemo(() => {
    if (axisOptions.length === 0) {
      return []
    }

    const availableValues = new Set(axisOptions.map(opt => opt.value))
    return PRESETS.filter(preset =>
      availableValues.has(preset.xMetric) && availableValues.has(preset.yMetric)
    )
  }, [axisOptions])

  // Initialize or update metrics when preset changes
  useEffect(() => {
    if (axisOptions.length === 0) {
      if (xMetric !== null) setXMetric(null)
      if (yMetric !== null) setYMetric(null)
      return
    }

    const availableValues = axisOptions.map(option => option.value)

    // Keep selectedPreset valid
    if (availablePresets.length === 0) {
      if (selectedPreset !== "custom") {
        setSelectedPreset("custom")
      }
    } else if (selectedPreset !== "custom") {
      const presetExists = availablePresets.some(preset => preset.id === selectedPreset)
      if (!presetExists) {
        setSelectedPreset(availablePresets[0].id)
        return
      }
    }

    // Handle preset selection
    if (selectedPreset !== "custom") {
      const preset = PRESETS.find(p => p.id === selectedPreset)
      if (preset && availableValues.includes(preset.xMetric) && availableValues.includes(preset.yMetric)) {
        if (xMetric !== preset.xMetric) setXMetric(preset.xMetric)
        if (yMetric !== preset.yMetric) setYMetric(preset.yMetric)
        return
      }
    }

    // Custom mode or preset not available - use fallback logic
    const findFirstAvailable = (preferred: string[], exclude?: string) => {
      for (const value of preferred) {
        if (value === exclude) continue
        if (availableValues.includes(value)) {
          return value
        }
      }
      const fallback = axisOptions.find(option => option.value !== exclude)
      return fallback?.value ?? null
    }

    const desiredX = xMetric && availableValues.includes(xMetric)
      ? xMetric
      : findFirstAvailable(preferredXAxisOrder)

    if (desiredX !== xMetric) {
      setXMetric(desiredX)
    }

    const desiredY = yMetric && availableValues.includes(yMetric) && yMetric !== desiredX
      ? yMetric
      : findFirstAvailable(preferredYAxisOrder, desiredX ?? undefined)

    if (desiredY !== yMetric) {
      setYMetric(desiredY)
    }
  }, [axisOptions, availablePresets, xMetric, yMetric, selectedPreset])

  // Detect when user manually changes axes (switch to custom mode)
  const handleXMetricChange = (value: string) => {
    setXMetric(value)
    if (selectedPreset !== "custom") {
      setSelectedPreset("custom")
    }
  }

  const handleYMetricChange = (value: string) => {
    setYMetric(value)
    if (selectedPreset !== "custom") {
      setSelectedPreset("custom")
    }
  }

  const axisOptionMap = useMemo(() => {
    return new Map(axisOptions.map(option => [option.value, option]))
  }, [axisOptions])

  type SlrMode = "ratio" | "percent" | null
  const slrModeFromMetric = (metric?: string | null): SlrMode => {
    if (metric === "slr_ratio_change") return "ratio"
    if (metric === "slr_ratio_change_pct") return "percent"
    return null
  }

  const activeSlrMode: SlrMode = slrModeFromMetric(xMetric) ??
    (selectedPreset === "slr-drift-vs-return" ? "ratio" : null)

  // Helper to build typed custom-data payloads for Plotly
  interface TooltipData {
    trade: number
    strategy: string
    date: string
    xLabel: string
    yLabel: string
    xFormatted: string
    yFormatted: string
    maeRaw: string
    mfeRaw: string
    pl: string
    profitCapture: string
    excursionRatio: string
    basisLabel: string
    premiumDenominator: string
    marginDenominator: string
    premiumPlPercent: string
    marginPlPercent: string
    openingSlr: string
    closingSlr: string
    slrDrift: string
  }

  type PlotCustomData = TooltipData

  const selectedX = xMetric ? axisOptionMap.get(xMetric) ?? null : null
  const selectedY = yMetric ? axisOptionMap.get(yMetric) ?? null : null

  const { plotData, layout } = useMemo(() => {
    if (!data?.mfeMaeData || data.mfeMaeData.length === 0 || !selectedX || !selectedY) {
      return { plotData: [], layout: {} }
    }

    const points = data.mfeMaeData
      .map(point => {
        const xValue = selectedX.accessor(point)
        const yValue = selectedY.accessor(point)

        if (!isFiniteNumber(xValue) || !isFiniteNumber(yValue)) {
          return null
        }

        return { point, xValue, yValue }
      })
      .filter((entry): entry is { point: MFEMAEDataPoint; xValue: number; yValue: number } => entry !== null)

    if (points.length === 0) {
      return { plotData: [], layout: {} }
    }

    const winners = points.filter(entry => entry.point.isWinner)
    const losers = points.filter(entry => !entry.point.isWinner)

    const toCustomData = (entry: { point: MFEMAEDataPoint; xValue: number; yValue: number }): PlotCustomData => {
      const { point, xValue, yValue } = entry
      const premiumMetrics = point.normalizedBy?.premium
      const marginMetrics = point.normalizedBy?.margin

      const openingSlr = point.openingShortLongRatio !== undefined
        ? formatAxisValue(point.openingShortLongRatio, ratioFormat)
        : "N/A"
      const closingSlr = point.closingShortLongRatio !== undefined
        ? formatAxisValue(point.closingShortLongRatio, ratioFormat)
        : "N/A"
      const slrDrift = point.shortLongRatioChange !== undefined
        ? point.shortLongRatioChangePct !== undefined
          ? `${formatAxisValue(point.shortLongRatioChange, ratioFormat)} (${formatAxisValue(point.shortLongRatioChangePct, percentFormat)})`
          : formatAxisValue(point.shortLongRatioChange, ratioFormat)
        : "N/A"

      return {
        trade: point.tradeNumber,
        strategy: point.strategy,
        date: point.date.toLocaleDateString(),
        xLabel: selectedX.axisLabel,
        yLabel: selectedY.axisLabel,
        xFormatted: formatAxisValue(xValue, selectedX.format),
        yFormatted: formatAxisValue(yValue, selectedY.format),
        maeRaw: formatAxisValue(point.mae ?? 0, rawCurrencyFormat),
        mfeRaw: formatAxisValue(point.mfe ?? 0, rawCurrencyFormat),
        pl: formatAxisValue(point.pl ?? 0, rawCurrencyFormat),
        profitCapture: point.profitCapturePercent !== undefined
          ? formatAxisValue(point.profitCapturePercent, percentFormat)
          : "N/A",
        excursionRatio: point.excursionRatio !== undefined
          ? formatAxisValue(point.excursionRatio, ratioFormat)
          : "N/A",
        basisLabel: efficiencyBasisLabels[point.basis],
        premiumDenominator: premiumMetrics?.denominator
          ? formatAxisValue(premiumMetrics.denominator, rawCurrencyFormat)
          : "—",
        marginDenominator: marginMetrics?.denominator
          ? formatAxisValue(marginMetrics.denominator, rawCurrencyFormat)
          : "—",
        premiumPlPercent: premiumMetrics?.plPercent !== undefined
          ? formatAxisValue(premiumMetrics.plPercent, percentFormat)
          : "N/A",
        marginPlPercent: marginMetrics?.plPercent !== undefined
          ? formatAxisValue(marginMetrics.plPercent, percentFormat)
          : "N/A",
        openingSlr,
        closingSlr,
        slrDrift
      }
    }

    const traces: Partial<PlotData>[] = []
    const winnerCustomData = winners.map(toCustomData)
    const loserCustomData = losers.map(toCustomData)

    if (winners.length > 0) {
      traces.push({
        x: winners.map(entry => entry.xValue),
        y: winners.map(entry => entry.yValue),
        type: "scatter",
        mode: "markers",
        name: "Winners",
        marker: {
          color: "#22c55e",
          size: 8,
          opacity: 0.7,
          line: {
            color: "#16a34a",
            width: 1
          }
        },
        customdata: winnerCustomData as unknown as PlotData["customdata"],
        hovertemplate:
          "<b>Winner - Trade #%{customdata.trade}</b><br>" +
          "Strategy: %{customdata.strategy}<br>" +
          "Date: %{customdata.date}<br>" +
          "%{customdata.xLabel}: %{customdata.xFormatted}<br>" +
          "%{customdata.yLabel}: %{customdata.yFormatted}<br>" +
          "Raw MAE: %{customdata.maeRaw}<br>" +
          "Raw MFE: %{customdata.mfeRaw}<br>" +
          "P&L: %{customdata.pl}<br>" +
          "Profit Capture: %{customdata.profitCapture}<br>" +
          "Excursion Ratio: %{customdata.excursionRatio}<br>" +
          "Normalization Basis: %{customdata.basisLabel}<br>" +
          "Premium Denominator: %{customdata.premiumDenominator}<br>" +
          "Margin Denominator: %{customdata.marginDenominator}<br>" +
          "Premium P&L: %{customdata.premiumPlPercent}<br>" +
          "Margin P&L: %{customdata.marginPlPercent}<br>" +
          "Opening S/L: %{customdata.openingSlr}<br>" +
          "Closing S/L: %{customdata.closingSlr}<br>" +
          "S/L Drift: %{customdata.slrDrift}" +
          "<extra></extra>"
      })
    }

    if (losers.length > 0) {
      traces.push({
        x: losers.map(entry => entry.xValue),
        y: losers.map(entry => entry.yValue),
        type: "scatter",
        mode: "markers",
        name: "Losers",
        marker: {
          color: "#ef4444",
          size: 8,
          opacity: 0.7,
          line: {
            color: "#dc2626",
            width: 1
          }
        },
        customdata: loserCustomData as unknown as PlotData["customdata"],
        hovertemplate:
          "<b>Loser - Trade #%{customdata.trade}</b><br>" +
          "Strategy: %{customdata.strategy}<br>" +
          "Date: %{customdata.date}<br>" +
          "%{customdata.xLabel}: %{customdata.xFormatted}<br>" +
          "%{customdata.yLabel}: %{customdata.yFormatted}<br>" +
          "Raw MAE: %{customdata.maeRaw}<br>" +
          "Raw MFE: %{customdata.mfeRaw}<br>" +
          "P&L: %{customdata.pl}<br>" +
          "Profit Capture: %{customdata.profitCapture}<br>" +
          "Excursion Ratio: %{customdata.excursionRatio}<br>" +
          "Normalization Basis: %{customdata.basisLabel}<br>" +
          "Premium Denominator: %{customdata.premiumDenominator}<br>" +
          "Margin Denominator: %{customdata.marginDenominator}<br>" +
          "Premium P&L: %{customdata.premiumPlPercent}<br>" +
          "Margin P&L: %{customdata.marginPlPercent}<br>" +
          "Opening S/L: %{customdata.openingSlr}<br>" +
          "Closing S/L: %{customdata.closingSlr}<br>" +
          "S/L Drift: %{customdata.slrDrift}" +
          "<extra></extra>"
      })
    }

    // Add diagonal line for MFE vs MAE charts
    const showDiagonal = (() => {
      if (!xMetric || !yMetric) return false
      if (xMetric === "mae" && yMetric === "mfe") return true
      if (xMetric.startsWith("mae_percent_") && yMetric.startsWith("mfe_percent_")) {
        return xMetric.replace("mae_percent_", "") === yMetric.replace("mfe_percent_", "")
      }
      return false
    })()

    if (showDiagonal) {
      const maxVal = Math.max(
        ...points.map(entry => Math.max(entry.xValue, entry.yValue))
      )

      traces.push({
        x: [0, maxVal],
        y: [0, maxVal],
        type: "scatter",
        mode: "lines",
        name: "MFE = MAE",
        line: {
          color: "#6b7280",
          width: 1,
          dash: "dash"
        },
        hoverinfo: "skip",
        showlegend: true
      })
    }

    // Add preset-specific traces
    const currentPreset = selectedPreset !== "custom" ? PRESETS.find(p => p.id === selectedPreset) : null
    if (currentPreset?.addSpecialTraces) {
      const specialTraces = currentPreset.addSpecialTraces(points, xMetric ?? "", yMetric ?? "")
      traces.push(...specialTraces)
    }

    // Base layout
    const baseLayout: Partial<Layout> = {
      xaxis: {
        title: { text: selectedX.axisLabel },
        showgrid: true,
        zeroline: true
      },
      yaxis: {
        title: { text: selectedY.axisLabel },
        showgrid: true,
        zeroline: true
      },
      showlegend: true,
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "right",
        x: 1
      },
      hovermode: "closest"
    }

    // Merge with preset-specific layout customizations
    const finalLayout: Partial<Layout> = currentPreset?.layoutCustomizations
      ? { ...baseLayout, ...currentPreset.layoutCustomizations }
      : baseLayout

    return { plotData: traces, layout: finalLayout }
  }, [data, selectedX, selectedY, xMetric, yMetric, selectedPreset])

  interface SlrTableRow {
    label: string
    count: number
    winRate: number
    avgPlPercent: number
    avgPlDollar: number
  }

  const slrCompanionRows = useMemo(() => {
    if (!data?.mfeMaeData || !activeSlrMode) {
      return []
    }

    const buckets = activeSlrMode === "percent" ? SLR_PERCENT_BUCKETS : SLR_RATIO_BUCKETS

    const points = data.mfeMaeData
      .map(point => {
        const ratio = point.shortLongRatioChange ?? null
        const pct = point.shortLongRatioChangePct ?? null
        const plPercent = point.normalizedBy?.premium?.plPercent ?? point.normalizedBy?.margin?.plPercent ?? point.plPercent ?? null

        if (activeSlrMode === "ratio" && !isFiniteNumber(ratio)) return null
        if (activeSlrMode === "percent" && !isFiniteNumber(pct)) return null
        if (!isFiniteNumber(plPercent)) return null

        return {
          ratio: ratio ?? 0,
          pct: pct ?? 0,
          plPercent,
          isWinner: point.isWinner,
          pl: point.pl
        }
      })
      .filter((entry): entry is { ratio: number; pct: number; plPercent: number; isWinner: boolean; pl: number } => entry !== null)

    if (points.length === 0) {
      return []
    }

    return buckets
      .map(bucket => {
        const bucketValues = points.filter(point => {
          const value = activeSlrMode === "percent" ? point.pct : point.ratio
          if (bucket.min === -Infinity) {
            return value < bucket.max
          }
          if (bucket.max === Infinity) {
            return value >= bucket.min
          }
          return value >= bucket.min && value < bucket.max
        })

        if (bucketValues.length === 0) {
          return null
        }

        const wins = bucketValues.filter(point => point.isWinner).length
        const winRate = (wins / bucketValues.length) * 100
        const avgPlPercent = bucketValues.reduce((sum, point) => sum + point.plPercent, 0) / bucketValues.length
        const avgPlDollar = bucketValues.reduce((sum, point) => sum + point.pl, 0) / bucketValues.length

        return {
          label: bucket.label,
          count: bucketValues.length,
          winRate,
          avgPlPercent,
          avgPlDollar
        }
      })
      .filter((row): row is SlrTableRow => row !== null)
  }, [data, activeSlrMode])

  // Get current preset for description
  const currentPreset = selectedPreset !== "custom" ? PRESETS.find(p => p.id === selectedPreset) : null

  const description = currentPreset
    ? currentPreset.description
    : selectedX && selectedY
    ? `Custom analysis: ${selectedY.axisLabel} vs ${selectedX.axisLabel}`
    : "Backtest theoretical risk versus reward scatter plot"

  const controls = axisOptions.length > 0 ? (
    <div className="flex flex-wrap items-center gap-3">
      {/* Preset Selector */}
      <div className="flex items-center gap-2">
        <Label htmlFor="preset-select" className="text-sm font-medium whitespace-nowrap">
          View:
        </Label>
        <Select value={selectedPreset} onValueChange={setSelectedPreset}>
          <SelectTrigger id="preset-select" size="sm" className="w-[200px]">
            <SelectValue placeholder="Select view" />
          </SelectTrigger>
          <SelectContent>
            {availablePresets.map(preset => (
              <SelectItem key={preset.id} value={preset.id}>
                {preset.label}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Axis Selectors - Always rendered but hidden when not in custom mode */}
      <div className={selectedPreset === "custom" ? "contents" : "hidden"}>
        <div className="flex items-center gap-2">
          <Label htmlFor="x-axis-select" className="text-sm font-medium whitespace-nowrap">
            X:
          </Label>
          <Select value={xMetric ?? undefined} onValueChange={handleXMetricChange}>
            <SelectTrigger id="x-axis-select" size="sm" className="w-[180px]">
              <SelectValue placeholder="X-axis" />
            </SelectTrigger>
            <SelectContent>
              {axisOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="y-axis-select" className="text-sm font-medium whitespace-nowrap">
            Y:
          </Label>
          <Select value={yMetric ?? undefined} onValueChange={handleYMetricChange}>
            <SelectTrigger id="y-axis-select" size="sm" className="w-[180px]">
              <SelectValue placeholder="Y-axis" />
            </SelectTrigger>
            <SelectContent>
              {axisOptions
                .filter(option => option.value !== xMetric || option.value === yMetric)
                .map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  ) : undefined

  const tooltip = {
    flavor: "Explore trade excursions through preset views or build custom comparisons.",
    detailed:
      "Start with preset views like 'MFE vs MAE' or 'Profit Capture Timeline' to discover key patterns. Switch to Custom mode to compare any metric combination - excursions vs premium, VIX, commissions, or any other trade parameter. Winners and losers stay color coded to highlight regime shifts and trading efficiency."
  }

  const renderChart = (
    <ChartWrapper
      title="🎯 Excursion Analysis"
      description={description}
      className={className}
      data={plotData}
      layout={layout}
      style={{ height: "500px" }}
      tooltip={tooltip}
      actions={controls}
    />
  )

  if (!data || !data.mfeMaeData || data.mfeMaeData.length === 0) {
    return renderChart
  }

  return (
    <div className="space-y-4">
      {renderChart}
      {slrCompanionRows.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">S/L Drift Outcome Table</p>
              <p className="text-xs text-muted-foreground">
                Visual drift bands translated into win rate and average returns so you can plug thresholds into the backtest inputs.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Drift Band</TableHead>
                  <TableHead>Trades</TableHead>
                  <TableHead>Win Rate</TableHead>
                  <TableHead>Avg P&amp;L (% Premium)</TableHead>
                  <TableHead>Avg P&amp;L ($)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slrCompanionRows.map(row => (
                  <TableRow key={row.label}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{formatAxisValue(row.winRate, percentFormat)}</TableCell>
                    <TableCell>{formatAxisValue(row.avgPlPercent, percentFormat)}</TableCell>
                    <TableCell>{formatAxisValue(row.avgPlDollar, rawCurrencyFormat)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
