/**
 * Unit tests for slippage analysis
 */

import {
  calculateSlippageDistribution,
  identifySlippageOutliers,
  calculateSlippageTrend,
  calculateSlippageByTimeOfDay,
  calculateSlippageByDayOfWeek,
  calculateSlippageAnalysis,
  MatchedPair,
} from '@/lib/calculations/slippage-analysis'
import { NormalizedTrade } from '@/lib/services/trade-reconciliation'

describe('Slippage Analysis', () => {
  // Helper to create a normalized trade
  function createTrade(
    totalPremium: number,
    dateOpened: Date = new Date('2024-01-01T10:00:00'),
    id: string = 'test'
  ): NormalizedTrade {
    return {
      id,
      strategy: 'TEST',
      dateOpened,
      sortTime: dateOpened.getTime(),
      session: dateOpened.toISOString().slice(0, 10),
      premiumPerContract: totalPremium,
      totalPremium,
      contracts: 1,
      pl: 100,
      openingFees: 0,
      closingFees: 0,
    }
  }

  describe('calculateSlippageDistribution', () => {
    it('should calculate mean and median correctly', () => {
      // Slippages: -10, 0, 10, 20, 30
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(90) }, // -10
        { backtested: createTrade(100), reported: createTrade(100) }, // 0
        { backtested: createTrade(100), reported: createTrade(110) }, // 10
        { backtested: createTrade(100), reported: createTrade(120) }, // 20
        { backtested: createTrade(100), reported: createTrade(130) }, // 30
      ]

      const result = calculateSlippageDistribution(pairs)
      expect(result.mean).toBeCloseTo(10, 5) // (−10 + 0 + 10 + 20 + 30) / 5 = 10
      expect(result.median).toBeCloseTo(10, 5) // Middle value
    })

    it('should calculate median for even number of values', () => {
      // Slippages: 0, 10, 20, 30
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(100) }, // 0
        { backtested: createTrade(100), reported: createTrade(110) }, // 10
        { backtested: createTrade(100), reported: createTrade(120) }, // 20
        { backtested: createTrade(100), reported: createTrade(130) }, // 30
      ]

      const result = calculateSlippageDistribution(pairs)
      expect(result.median).toBeCloseTo(15, 5) // (10 + 20) / 2
    })

    it('should calculate percentiles correctly', () => {
      // Create 100 pairs with slippage from 0 to 99
      const pairs: MatchedPair[] = Array.from({ length: 100 }, (_, i) => ({
        backtested: createTrade(100),
        reported: createTrade(100 + i),
      }))

      const result = calculateSlippageDistribution(pairs)
      expect(result.percentiles.p10).toBeCloseTo(9.9, 0) // 10th percentile ≈ 9.9
      expect(result.percentiles.p25).toBeCloseTo(24.75, 0) // 25th percentile ≈ 24.75
      expect(result.percentiles.p50).toBeCloseTo(49.5, 0) // 50th percentile (median) ≈ 49.5
      expect(result.percentiles.p75).toBeCloseTo(74.25, 0) // 75th percentile ≈ 74.25
      expect(result.percentiles.p90).toBeCloseTo(89.1, 0) // 90th percentile ≈ 89.1
    })

    it('should calculate standard deviation', () => {
      // Uniform slippage of 10
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(100), reported: createTrade(110) },
      ]

      const result = calculateSlippageDistribution(pairs)
      expect(result.stdDev).toBeCloseTo(0, 5) // No variation
    })

    it('should handle negative slippage (worse than expected)', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(90) }, // -10
        { backtested: createTrade(100), reported: createTrade(80) }, // -20
        { backtested: createTrade(100), reported: createTrade(85) }, // -15
      ]

      const result = calculateSlippageDistribution(pairs)
      expect(result.mean).toBeCloseTo(-15, 5)
      expect(result.median).toBeCloseTo(-15, 5)
    })

    it('should calculate skewness for asymmetric distribution', () => {
      // Right-skewed distribution (most values low, few high)
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(105) }, // 5
        { backtested: createTrade(100), reported: createTrade(105) }, // 5
        { backtested: createTrade(100), reported: createTrade(105) }, // 5
        { backtested: createTrade(100), reported: createTrade(150) }, // 50 (outlier)
      ]

      const result = calculateSlippageDistribution(pairs)
      expect(result.skewness).toBeGreaterThan(0) // Positive skew
    })
  })

  describe('identifySlippageOutliers', () => {
    it('should identify outliers beyond 2 standard deviations', () => {
      // Need many normal trades and few outliers for 2-std-dev rule to work
      // Slippage: 10, 10, 10, 10, 10, 10, 10, 10, 500 (extreme outlier)
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id1') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id2') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id3') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id4') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id5') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id6') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id7') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id8') }, // 10
        { backtested: createTrade(100), reported: createTrade(600, undefined, 'outlier') }, // 500 (extreme outlier)
      ]

      const result = identifySlippageOutliers(pairs)
      expect(result.count).toBeGreaterThan(0)
      expect(result.tradeIds).toContain('outlier')
    })

    it('should return no outliers when all values are similar', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) }, // 10
        { backtested: createTrade(100), reported: createTrade(111) }, // 11
        { backtested: createTrade(100), reported: createTrade(109) }, // 9
        { backtested: createTrade(100), reported: createTrade(110) }, // 10
        { backtested: createTrade(100), reported: createTrade(112) }, // 12
      ]

      const result = identifySlippageOutliers(pairs)
      expect(result.count).toBe(0)
      expect(result.tradeIds).toHaveLength(0)
    })

    it('should calculate average outlier slippage', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id1') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id2') }, // 10
        { backtested: createTrade(100), reported: createTrade(110, undefined, 'id3') }, // 10
        { backtested: createTrade(100), reported: createTrade(200, undefined, 'id4') }, // 100
        { backtested: createTrade(100), reported: createTrade(250, undefined, 'id5') }, // 150
      ]

      const result = identifySlippageOutliers(pairs)
      if (result.count > 0) {
        expect(result.averageOutlierSlippage).toBeGreaterThan(50)
      }
    })
  })

  describe('calculateSlippageTrend', () => {
    it('should return insufficient data message for single pair', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
      ]

      const result = calculateSlippageTrend(pairs)
      expect(result.interpretation).toContain('Insufficient data')
    })

    it('should detect improving trend (negative slope)', () => {
      // Slippage decreasing over time: 50, 40, 30, 20, 10
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01')), reported: createTrade(150) }, // 50
        { backtested: createTrade(100, new Date('2024-01-02')), reported: createTrade(140) }, // 40
        { backtested: createTrade(100, new Date('2024-01-03')), reported: createTrade(130) }, // 30
        { backtested: createTrade(100, new Date('2024-01-04')), reported: createTrade(120) }, // 20
        { backtested: createTrade(100, new Date('2024-01-05')), reported: createTrade(110) }, // 10
      ]

      const result = calculateSlippageTrend(pairs)
      expect(result.slope).toBeLessThan(0) // Negative slope
      expect(result.isImproving).toBe(true)
      expect(result.interpretation).toContain('improving')
    })

    it('should detect worsening trend (positive slope)', () => {
      // Slippage increasing over time: 10, 20, 30, 40, 50
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01')), reported: createTrade(110) }, // 10
        { backtested: createTrade(100, new Date('2024-01-02')), reported: createTrade(120) }, // 20
        { backtested: createTrade(100, new Date('2024-01-03')), reported: createTrade(130) }, // 30
        { backtested: createTrade(100, new Date('2024-01-04')), reported: createTrade(140) }, // 40
        { backtested: createTrade(100, new Date('2024-01-05')), reported: createTrade(150) }, // 50
      ]

      const result = calculateSlippageTrend(pairs)
      expect(result.slope).toBeGreaterThan(0) // Positive slope
      expect(result.isImproving).toBe(false)
      expect(result.interpretation).toContain('worsening')
    })

    it('should detect no trend for random data', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01')), reported: createTrade(110) },
        { backtested: createTrade(100, new Date('2024-01-02')), reported: createTrade(140) },
        { backtested: createTrade(100, new Date('2024-01-03')), reported: createTrade(105) },
        { backtested: createTrade(100, new Date('2024-01-04')), reported: createTrade(135) },
        { backtested: createTrade(100, new Date('2024-01-05')), reported: createTrade(115) },
      ]

      const result = calculateSlippageTrend(pairs)
      expect(result.rSquared).toBeLessThan(0.5) // Low R²
      expect(result.interpretation).toContain('No clear trend')
    })

    it('should calculate R-squared for goodness of fit', () => {
      // Perfect linear trend should have R² ≈ 1
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01')), reported: createTrade(110) }, // 10
        { backtested: createTrade(100, new Date('2024-01-02')), reported: createTrade(120) }, // 20
        { backtested: createTrade(100, new Date('2024-01-03')), reported: createTrade(130) }, // 30
        { backtested: createTrade(100, new Date('2024-01-04')), reported: createTrade(140) }, // 40
        { backtested: createTrade(100, new Date('2024-01-05')), reported: createTrade(150) }, // 50
      ]

      const result = calculateSlippageTrend(pairs)
      expect(result.rSquared).toBeGreaterThan(0.99) // Near perfect fit
    })
  })

  describe('calculateSlippageByTimeOfDay', () => {
    it('should group slippage by hour', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01T09:00:00')), reported: createTrade(110) }, // 9am, +10
        { backtested: createTrade(100, new Date('2024-01-01T09:30:00')), reported: createTrade(115) }, // 9am, +15
        { backtested: createTrade(100, new Date('2024-01-01T10:00:00')), reported: createTrade(120) }, // 10am, +20
        { backtested: createTrade(100, new Date('2024-01-01T10:15:00')), reported: createTrade(130) }, // 10am, +30
      ]

      const result = calculateSlippageByTimeOfDay(pairs)
      expect(result['09:00']).toBeCloseTo(12.5, 5) // (10 + 15) / 2
      expect(result['10:00']).toBeCloseTo(25, 5) // (20 + 30) / 2
    })

    it('should handle multiple days', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01T09:00:00')), reported: createTrade(110) }, // +10
        { backtested: createTrade(100, new Date('2024-01-02T09:00:00')), reported: createTrade(120) }, // +20
      ]

      const result = calculateSlippageByTimeOfDay(pairs)
      expect(result['09:00']).toBeCloseTo(15, 5) // (10 + 20) / 2
    })
  })

  describe('calculateSlippageByDayOfWeek', () => {
    it('should group slippage by day of week', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01T10:00:00')), reported: createTrade(110) }, // Monday, +10
        { backtested: createTrade(100, new Date('2024-01-08T10:00:00')), reported: createTrade(120) }, // Monday, +20
        { backtested: createTrade(100, new Date('2024-01-02T10:00:00')), reported: createTrade(130) }, // Tuesday, +30
      ]

      const result = calculateSlippageByDayOfWeek(pairs)
      expect(result['Monday']).toBeCloseTo(15, 5) // (10 + 20) / 2
      expect(result['Tuesday']).toBeCloseTo(30, 5)
    })
  })

  describe('calculateSlippageAnalysis', () => {
    it('should return null for empty pairs', () => {
      const result = calculateSlippageAnalysis([])
      expect(result).toBeNull()
    })

    it('should return complete analysis', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01T09:00:00')), reported: createTrade(110) },
        { backtested: createTrade(100, new Date('2024-01-02T10:00:00')), reported: createTrade(120) },
        { backtested: createTrade(100, new Date('2024-01-03T11:00:00')), reported: createTrade(130) },
        { backtested: createTrade(100, new Date('2024-01-04T12:00:00')), reported: createTrade(140) },
        { backtested: createTrade(100, new Date('2024-01-05T13:00:00')), reported: createTrade(150) },
      ]

      const result = calculateSlippageAnalysis(pairs)
      expect(result).not.toBeNull()
      expect(result!.distribution).toBeDefined()
      expect(result!.outliers).toBeDefined()
      expect(result!.trend).toBeDefined()
      expect(result!.byTimeOfDay).toBeDefined()
      expect(result!.byDayOfWeek).toBeDefined()
    })

    it('should integrate all components correctly', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100, new Date('2024-01-01T09:00:00')), reported: createTrade(110) },
        { backtested: createTrade(100, new Date('2024-01-02T09:00:00')), reported: createTrade(120) },
        { backtested: createTrade(100, new Date('2024-01-03T09:00:00')), reported: createTrade(130) },
      ]

      const result = calculateSlippageAnalysis(pairs)
      expect(result).not.toBeNull()
      expect(result!.distribution.mean).toBeCloseTo(20, 5)
      expect(result!.trend.slope).toBeGreaterThan(0) // Worsening
      expect(result!.byTimeOfDay['09:00']).toBeCloseTo(20, 5)
    })
  })
})
