"use client"

import { MetricCard } from "@/components/metric-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { calculateDualEquityCurves, calculateSeparateEquityCurves, MatchedPair } from "@/lib/calculations/reconciliation-stats"
import { AlignedTradeSet, AlignmentMetrics } from "@/lib/services/trade-reconciliation"
import { cn } from "@/lib/utils"
import { DualEquityCurveChart } from "./DualEquityCurveChart"
import { SlippageDistributionChart, computeSlippageDistribution } from "./SlippageDistributionChart"

interface ReconciliationMetricsProps {
  metrics: AlignmentMetrics
  alignment: AlignedTradeSet // Need full alignment to calculate session-based match rate
  normalizeTo1Lot?: boolean
  className?: string
}

export function ReconciliationMetrics({ metrics, alignment, normalizeTo1Lot = false, className }: ReconciliationMetricsProps) {
  const {
    backtested,
    delta,
    slippagePerContract,
    tTest,
    correlation,
    matched,
  } = metrics

  // Calculate session-based match rate (more accurate than trade-based)
  const totalSessions = alignment.sessions.length
  const matchedSessions = alignment.sessions.filter(session =>
    session.items.some(item => item.isPaired)
  ).length
  const sessionMatchRate = totalSessions > 0 ? matchedSessions / totalSessions : 0

  // Calculate derived metrics
  const plDifferencePercent = backtested.totalPl !== 0
    ? (delta.totalPl / Math.abs(backtested.totalPl)) * 100
    : null

  const plDifferenceSubtitle = plDifferencePercent !== null
    ? `${plDifferencePercent >= 0 ? '+' : ''}${plDifferencePercent.toFixed(1)}%`
    : 'N/A'

  const avgSlippagePerTrade = matched.tradeCount > 0
    ? matched.totalSlippage / matched.tradeCount
    : null

  const slippageAsPercentOfPremium = Math.abs(matched.backtestedAvgPremiumPerContract) > 1e-6
    ? (slippagePerContract / Math.abs(matched.backtestedAvgPremiumPerContract)) * 100
    : null

  const formatCurrency = (value: number) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)

  const slippagePercentBreakdown = slippageAsPercentOfPremium !== null
    ? `${formatCurrency(slippagePerContract)} / ${formatCurrency(Math.abs(matched.backtestedAvgPremiumPerContract))}`
    : undefined

  const matchedAvgPremiumDisplay = formatCurrency(matched.backtestedAvgPremiumPerContract)
  const slippagePerContractDisplay = formatCurrency(slippagePerContract)
  const avgSlippagePerTradeDisplay = avgSlippagePerTrade != null ? formatCurrency(avgSlippagePerTrade) : null
  const slippageDistribution = computeSlippageDistribution(alignment, normalizeTo1Lot)

  // Compute matched pairs for equity curve
  const matchedPairs: MatchedPair[] = alignment.sessions.flatMap(session =>
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

  // Sort pairs by date for equity curve
  const sortedPairs = matchedPairs.sort((a, b) =>
    new Date(a.reported.dateOpened).getTime() - new Date(b.reported.dateOpened).getTime()
  )

  const equityCurveData = sortedPairs.length > 0
    ? calculateDualEquityCurves(sortedPairs, 0, normalizeTo1Lot)
    : null

  // Calculate separate equity curves for all trades (matched + unmatched)
  const allTradesData = calculateSeparateEquityCurves(
    alignment.backtestedTrades,
    alignment.reportedTrades,
    0,
    normalizeTo1Lot
  )

  const slippageMeanDisplay = slippageDistribution ? formatCurrency(slippageDistribution.mean) : "N/A"
  const slippageMedianDisplay = slippageDistribution ? formatCurrency(slippageDistribution.median) : "N/A"
  const slippageP10Display = slippageDistribution ? formatCurrency(slippageDistribution.p10) : "N/A"
  const slippageP90Display = slippageDistribution ? formatCurrency(slippageDistribution.p90) : "N/A"
  const slippageCountDisplay = slippageDistribution
    ? `+${slippageDistribution.positiveCount} / ${slippageDistribution.neutralCount} / ${slippageDistribution.negativeCount}`
    : "N/A"

  return (
    <div className={cn("space-y-4", className)}>
      {/* Match Quality & Trade Counts - Compact Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Match Rate - Larger span */}
        <Card className="md:col-span-2 relative backdrop-blur-sm bg-background/50 border-border/50 transition-all duration-200 hover:shadow-md hover:bg-background/80 py-0">
          <CardContent className="px-0 p-2">
            <div className="space-y-1 text-center">
              {/* Title */}
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">Match Quality</span>
              </div>

              {/* Value */}
              <div className="text-base font-semibold">
                {(sessionMatchRate * 100).toFixed(1)}%
              </div>

              {/* Subtitle */}
              <div className="text-xs text-muted-foreground">
                {matchedSessions} of {totalSessions} sessions
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Backtested Trades */}
        <MetricCard
          title="Backtested"
          value={alignment.backtestedTrades.length}
          format="number"
          subtitle="trades included"
          size="sm"
        />

        {/* Reported Trades */}
        <MetricCard
          title="Reported"
          value={alignment.reportedTrades.length}
          format="number"
          subtitle="trades included"
          size="sm"
        />

        {/* Unmatched Sessions */}
        <MetricCard
          title="Unmatched"
          value={totalSessions - matchedSessions}
          format="number"
          subtitle="sessions"
          size="sm"
          isPositive={totalSessions - matchedSessions === 0}
        />
      </div>

      {/* Performance Delta Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          title="Avg Premium / Contract"
          value={matchedAvgPremiumDisplay}
          format="number"
          size="sm"
          tooltip={{
            flavor: "Average matched backtested premium per contract",
            detailed: "Baseline premium from matched backtested trades. Used as the denominator when computing slippage percentage."
          }}
        />

        <MetricCard
          title="Avg Slippage / Contract"
          value={slippagePerContractDisplay}
          format="number"
          isPositive={slippagePerContract >= 0}
          size="sm"
          tooltip={{
            flavor: "Slippage normalized per contract",
            detailed: "Shows slippage on a per-contract basis, useful for comparing strategies with different position sizes."
          }}
        />

        <MetricCard
          title="Avg Slippage / Trade"
          value={avgSlippagePerTradeDisplay ?? 'N/A'}
          format="number"
          isPositive={avgSlippagePerTrade != null ? avgSlippagePerTrade >= 0 : undefined}
          size="sm"
          tooltip={{
            flavor: "Average slippage per trade execution",
            detailed: "Measures the average difference in premium captured per trade. Positive slippage means better execution than expected."
          }}
        />

        <MetricCard
          title="Slippage % of Premium"
          value={slippageAsPercentOfPremium ?? 'N/A'}
          format="percentage"
          isPositive={slippageAsPercentOfPremium != null ? slippageAsPercentOfPremium >= 0 : undefined}
          size="sm"
          tooltip={{
            flavor: "Slippage as percentage of average premium",
            detailed: slippagePercentBreakdown
              ? `Calculated as ${formatCurrency(slippagePerContract)} divided by ${formatCurrency(Math.abs(matched.backtestedAvgPremiumPerContract))}. Numerator is Avg Slippage / Contract; denominator is Avg Premium / Contract. Values near 0% indicate execution closely matched expectations.`
              : "Relative measure of slippage impact. Values near 0% indicate execution closely matched expectations."
          }}
        />

        <MetricCard
          title="Net P/L Δ"
          value={delta.totalPl}
          format="currency"
          isPositive={delta.totalPl >= 0}
          subtitle={plDifferenceSubtitle}
          size="sm"
          tooltip={{
            flavor: "Difference between reported and backtested P/L",
            detailed: "Positive values indicate reported performance exceeded backtested expectations. This includes slippage, execution differences, and timing variations."
          }}
        />
      </div>

      {slippageDistribution && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            title="Slippage Mean"
            value={slippageMeanDisplay}
            size="sm"
            tooltip={{
              flavor: "Average slippage across matched trades",
              detailed: "Represents the average difference between reported and backtested premium with the current normalization setting."
            }}
          />

          <MetricCard
            title="Slippage Median"
            value={slippageMedianDisplay}
            size="sm"
            tooltip={{
              flavor: "Middle slippage value",
              detailed: "Half of matched trades have slippage above this value and half below it."
            }}
          />

          <MetricCard
            title="P10 / P90"
            value={`${slippageP10Display} / ${slippageP90Display}`}
            size="sm"
            tooltip={{
              flavor: "Tail slippage",
              detailed: "Shows the outer 20% of slippage outcomes: 10% of trades were worse than the first value, 10% were better than the second value."
            }}
          />

          <MetricCard
            title="Favorable / Neutral / Unfavorable"
            value={slippageCountDisplay}
            size="sm"
            tooltip={{
              flavor: "Execution outcome breakdown",
              detailed: "Counts of matched trades with positive, zero, and negative slippage respectively."
            }}
          />
        </div>
      )}

      <SlippageDistributionChart data={slippageDistribution} normalizeTo1Lot={normalizeTo1Lot} />

      <DualEquityCurveChart matchedData={equityCurveData} allTradesData={allTradesData} normalizeTo1Lot={normalizeTo1Lot} />

      {/* Statistical Significance Card */}
      {tTest && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Statistical Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Key Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                title="p-value"
                value={tTest.pValue < 0.001 ? '<0.001' : tTest.pValue.toFixed(3)}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Probability of seeing a difference this extreme if backtested and reported P/L were identical",
                  detailed: "Lower p-values (< 0.05) indicate the observed difference in matched P/L is unlikely to be due to random chance."
                }}
              />

              <MetricCard
                title="t-statistic"
                value={tTest.tStatistic.toFixed(2)}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Standardized effect size for the paired P/L differences",
                  detailed: "Higher absolute t-statistics signal stronger evidence against the null hypothesis of equal backtested and reported performance."
                }}
              />

              <MetricCard
                title="Mean Diff"
                value={formatCurrency(tTest.meanDifference)}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Average reported minus backtested P/L per matched trade",
                  detailed: "Positive values mean reported trades outperformed backtests on average. Values respect the 1-lot normalization toggle."
                }}
              />

              <MetricCard
                title="Degrees of Freedom"
                value={tTest.degreesOfFreedom}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Number of independent paired observations minus one",
                  detailed: "Equal to matched trade count - 1. More degrees of freedom produce more reliable p-values."
                }}
              />
            </div>

            {/* Confidence Interval */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
              <MetricCard
                title="95% CI Lower"
                value={formatCurrency(tTest.confidenceInterval[0])}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Lower bound of the 95% confidence interval",
                  detailed: "We are 95% confident the true average reported-minus-backtested P/L falls above this value."
                }}
              />

              <MetricCard
                title="95% CI Upper"
                value={formatCurrency(tTest.confidenceInterval[1])}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Upper bound of the 95% confidence interval",
                  detailed: "We are 95% confident the true average reported-minus-backtested P/L falls below this value."
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Correlation Card */}
      {correlation && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Correlation Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                title="Pearson r"
                value={correlation.pearsonR.toFixed(3)}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Linear correlation between backtested and reported P/L",
                  detailed: "Measures how closely reported results track backtested results on a trade-by-trade basis. Values near ±1 indicate strong linear alignment."
                }}
              />

              <MetricCard
                title="Spearman ρ"
                value={correlation.spearmanRho.toFixed(3)}
                format="number"
                size="sm"
                tooltip={{
                  flavor: "Rank correlation between backtested and reported P/L",
                  detailed: "Captures whether the relative ordering of trade outcomes matches between backtested and reported results, even when magnitudes differ."
                }}
              />
            </div>

            {correlation.interpretation && (
              <div className="text-xs text-muted-foreground leading-relaxed">
                {correlation.interpretation}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
