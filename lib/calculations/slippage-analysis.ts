/**
 * Slippage analysis for trade reconciliation
 *
 * Provides statistical analysis of slippage patterns, outlier detection,
 * and trend analysis for comparing backtested vs reported performance.
 */

import { NormalizedTrade } from '@/lib/services/trade-reconciliation'

export interface MatchedPair {
  backtested: NormalizedTrade
  reported: NormalizedTrade
}

export interface SlippageDistribution {
  mean: number
  median: number
  mode: number | null
  stdDev: number
  percentiles: {
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
  }
  skewness: number
  kurtosis: number
}

export interface SlippageOutliers {
  count: number
  tradeIds: string[]
  averageOutlierSlippage: number
  threshold: number // 2 std deviations
}

export interface SlippageTrend {
  slope: number // positive = worsening, negative = improving
  intercept: number
  isImproving: boolean
  rSquared: number
  interpretation: string
}

export interface SlippageAnalysis {
  distribution: SlippageDistribution
  outliers: SlippageOutliers
  trend: SlippageTrend
  byTimeOfDay: Record<string, number> // "09:30" -> avg slippage
  byDayOfWeek: Record<string, number> // "Monday" -> avg slippage
}

/**
 * Calculate comprehensive slippage analysis
 *
 * @param pairs - Array of matched trade pairs
 * @returns Complete slippage analysis
 */
export function calculateSlippageAnalysis(pairs: MatchedPair[]): SlippageAnalysis | null {
  if (pairs.length === 0) {
    return null
  }

  const distribution = calculateSlippageDistribution(pairs)
  const outliers = identifySlippageOutliers(pairs, distribution)
  const trend = calculateSlippageTrend(pairs)
  const byTimeOfDay = calculateSlippageByTimeOfDay(pairs)
  const byDayOfWeek = calculateSlippageByDayOfWeek(pairs)

  return {
    distribution,
    outliers,
    trend,
    byTimeOfDay,
    byDayOfWeek,
  }
}

/**
 * Calculate slippage distribution statistics
 *
 * Slippage = reported premium - backtested premium
 * Positive = better than expected, Negative = worse than expected
 */
export function calculateSlippageDistribution(pairs: MatchedPair[]): SlippageDistribution {
  const slippages = pairs.map(pair => pair.reported.totalPremium - pair.backtested.totalPremium)
  const n = slippages.length

  // Mean
  const mean = slippages.reduce((sum, s) => sum + s, 0) / n

  // Median
  const sorted = [...slippages].sort((a, b) => a - b)
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)]

  // Mode (most frequent value, binned)
  const mode = calculateMode(slippages)

  // Standard deviation (sample)
  const variance = slippages.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (n - 1)
  const stdDev = Math.sqrt(variance)

  // Percentiles
  const percentiles = {
    p10: calculatePercentile(sorted, 10),
    p25: calculatePercentile(sorted, 25),
    p50: median,
    p75: calculatePercentile(sorted, 75),
    p90: calculatePercentile(sorted, 90),
    p95: calculatePercentile(sorted, 95),
    p99: calculatePercentile(sorted, 99),
  }

  // Skewness (measure of asymmetry)
  const skewness = slippages.reduce(
    (sum, s) => sum + Math.pow((s - mean) / stdDev, 3),
    0
  ) / n

  // Kurtosis (measure of tail heaviness)
  const kurtosis = slippages.reduce(
    (sum, s) => sum + Math.pow((s - mean) / stdDev, 4),
    0
  ) / n - 3 // excess kurtosis

  return {
    mean,
    median,
    mode,
    stdDev,
    percentiles,
    skewness,
    kurtosis,
  }
}

/**
 * Identify outlier trades with excessive slippage
 *
 * Outliers are defined as trades with slippage > 2 standard deviations from mean
 */
export function identifySlippageOutliers(
  pairs: MatchedPair[],
  distribution?: SlippageDistribution
): SlippageOutliers {
  const dist = distribution || calculateSlippageDistribution(pairs)
  const threshold = 2 * dist.stdDev

  const outlierPairs = pairs.filter(pair => {
    const slippage = pair.reported.totalPremium - pair.backtested.totalPremium
    return Math.abs(slippage - dist.mean) > threshold
  })

  const averageOutlierSlippage = outlierPairs.length > 0
    ? outlierPairs.reduce(
        (sum, pair) => sum + (pair.reported.totalPremium - pair.backtested.totalPremium),
        0
      ) / outlierPairs.length
    : 0

  return {
    count: outlierPairs.length,
    tradeIds: outlierPairs.map(pair => pair.reported.id),
    averageOutlierSlippage,
    threshold,
  }
}

/**
 * Calculate slippage trend over time using linear regression
 *
 * Returns slope (change per trade) and whether slippage is improving
 */
export function calculateSlippageTrend(pairs: MatchedPair[]): SlippageTrend {
  if (pairs.length < 2) {
    return {
      slope: 0,
      intercept: 0,
      isImproving: false,
      rSquared: 0,
      interpretation: 'Insufficient data for trend analysis',
    }
  }

  // Sort pairs by time
  const sortedPairs = [...pairs].sort((a, b) => a.backtested.sortTime - b.backtested.sortTime)

  // X values: trade index (0, 1, 2, ...)
  // Y values: slippage
  const n = sortedPairs.length
  const slippages = sortedPairs.map(pair => pair.reported.totalPremium - pair.backtested.totalPremium)

  const meanX = (n - 1) / 2 // mean of 0, 1, 2, ..., n-1
  const meanY = slippages.reduce((sum, s) => sum + s, 0) / n

  // Calculate slope and intercept using least squares regression
  let numerator = 0
  let denominator = 0

  for (let i = 0; i < n; i++) {
    const x = i
    const y = slippages[i]
    numerator += (x - meanX) * (y - meanY)
    denominator += (x - meanX) * (x - meanX)
  }

  const slope = denominator !== 0 ? numerator / denominator : 0
  const intercept = meanY - slope * meanX

  // Calculate R-squared
  let ssRes = 0 // sum of squares of residuals
  let ssTot = 0 // total sum of squares

  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept
    const actual = slippages[i]
    ssRes += Math.pow(actual - predicted, 2)
    ssTot += Math.pow(actual - meanY, 2)
  }

  const rSquared = ssTot !== 0 ? 1 - (ssRes / ssTot) : 0

  // Negative slope = improving (slippage decreasing over time)
  const isImproving = slope < 0

  const interpretation = interpretSlippageTrend(slope, rSquared, isImproving)

  return {
    slope,
    intercept,
    isImproving,
    rSquared,
    interpretation,
  }
}

/**
 * Interpret slippage trend
 */
function interpretSlippageTrend(slope: number, rSquared: number, isImproving: boolean): string {
  if (rSquared < 0.1) {
    return 'No clear trend detected. Slippage appears random over time.'
  }

  const strength = rSquared > 0.5 ? 'strong' : rSquared > 0.3 ? 'moderate' : 'weak'
  const direction = isImproving ? 'improving' : 'worsening'
  const change = Math.abs(slope).toFixed(2)

  return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} trend (R²=${rSquared.toFixed(3)}). Slippage is ${direction} by approximately $${change} per trade.`
}

/**
 * Calculate average slippage by time of day
 *
 * Groups trades by hour and returns average slippage for each hour
 */
export function calculateSlippageByTimeOfDay(pairs: MatchedPair[]): Record<string, number> {
  const hourlySlippage: Record<string, number[]> = {}

  pairs.forEach(pair => {
    const date = pair.backtested.dateOpened
    const hour = date.getHours()
    const hourKey = `${hour.toString().padStart(2, '0')}:00`

    const slippage = pair.reported.totalPremium - pair.backtested.totalPremium

    if (!hourlySlippage[hourKey]) {
      hourlySlippage[hourKey] = []
    }
    hourlySlippage[hourKey].push(slippage)
  })

  const result: Record<string, number> = {}
  Object.keys(hourlySlippage).forEach(hour => {
    const slippages = hourlySlippage[hour]
    result[hour] = slippages.reduce((sum, s) => sum + s, 0) / slippages.length
  })

  return result
}

/**
 * Calculate average slippage by day of week
 */
export function calculateSlippageByDayOfWeek(pairs: MatchedPair[]): Record<string, number> {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dailySlippage: Record<string, number[]> = {}

  pairs.forEach(pair => {
    const date = pair.backtested.dateOpened
    const dayName = dayNames[date.getDay()]

    const slippage = pair.reported.totalPremium - pair.backtested.totalPremium

    if (!dailySlippage[dayName]) {
      dailySlippage[dayName] = []
    }
    dailySlippage[dayName].push(slippage)
  })

  const result: Record<string, number> = {}
  Object.keys(dailySlippage).forEach(day => {
    const slippages = dailySlippage[day]
    result[day] = slippages.reduce((sum, s) => sum + s, 0) / slippages.length
  })

  return result
}

/**
 * Calculate percentile value from sorted array
 */
function calculatePercentile(sorted: number[], percentile: number): number {
  const index = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  if (lower === upper) {
    return sorted[lower]
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

/**
 * Calculate mode (most frequent value, binned to nearest 0.5)
 *
 * Returns null if distribution is too uniform
 */
function calculateMode(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }

  // Bin values to nearest 0.5 for mode calculation
  const binSize = 0.5
  const bins: Record<number, number> = {}

  values.forEach(value => {
    const binned = Math.round(value / binSize) * binSize
    bins[binned] = (bins[binned] || 0) + 1
  })

  // Find bin with highest frequency
  let maxFreq = 0
  let modeValue: number | null = null

  Object.entries(bins).forEach(([value, freq]) => {
    if (freq > maxFreq) {
      maxFreq = freq
      modeValue = parseFloat(value)
    }
  })

  // Only return mode if it appears in at least 10% of trades
  if (maxFreq < values.length * 0.1) {
    return null
  }

  return modeValue
}

/**
 * Calculate slippage per contract for each pair
 *
 * Useful for normalizing slippage across different contract sizes
 */
export function calculateSlippagePerContract(pairs: MatchedPair[]): number[] {
  return pairs.map(pair => {
    const slippage = pair.reported.totalPremium - pair.backtested.totalPremium
    const contracts = pair.backtested.contracts || 1
    return slippage / contracts
  })
}
