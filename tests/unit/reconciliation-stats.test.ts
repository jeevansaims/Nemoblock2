/**
 * Unit tests for reconciliation statistical analysis
 */

import {
  calculatePairedTTest,
  calculatePearsonCorrelation,
  calculateSpearmanCorrelation,
  calculateCorrelationMetrics,
  calculateDualEquityCurves,
  calculateSeparateEquityCurves,
  MatchedPair,
} from '@/lib/calculations/reconciliation-stats'
import { NormalizedTrade } from '@/lib/services/trade-reconciliation'

describe('Reconciliation Statistics', () => {
  // Helper to create a normalized trade
  function createTrade(pl: number, id: string = 'test'): NormalizedTrade {
    return {
      id,
      strategy: 'TEST',
      dateOpened: new Date('2024-01-01'),
      sortTime: Date.now(),
      session: '2024-01-01',
      premiumPerContract: 100,
      totalPremium: 100,
      contracts: 1,
      pl,
      openingFees: 0,
      closingFees: 0,
    }
  }

  describe('calculatePairedTTest', () => {
    it('should return null for empty array', () => {
      const result = calculatePairedTTest([])
      expect(result).toBeNull()
    })

    it('should handle single observation', () => {
      const pairs: MatchedPair[] = [
        {
          backtested: createTrade(100),
          reported: createTrade(110),
        },
      ]

      const result = calculatePairedTTest(pairs)
      expect(result).not.toBeNull()
      expect(result!.meanDifference).toBe(10)
      expect(result!.isSignificant).toBe(false)
      expect(result!.interpretation).toContain('Insufficient data')
    })

    it('should detect no significant difference when P/Ls are identical', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(100) },
        { backtested: createTrade(200), reported: createTrade(200) },
        { backtested: createTrade(150), reported: createTrade(150) },
        { backtested: createTrade(120), reported: createTrade(120) },
        { backtested: createTrade(180), reported: createTrade(180) },
      ]

      const result = calculatePairedTTest(pairs)
      expect(result).not.toBeNull()
      expect(result!.meanDifference).toBeCloseTo(0, 10)
      expect(result!.tStatistic).toBeCloseTo(0, 10)
      expect(result!.isSignificant).toBe(false)
    })

    it('should detect significant positive difference', () => {
      // Reported consistently higher by ~$50 with some variance
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(152) }, // +52
        { backtested: createTrade(200), reported: createTrade(248) }, // +48
        { backtested: createTrade(150), reported: createTrade(201) }, // +51
        { backtested: createTrade(120), reported: createTrade(169) }, // +49
        { backtested: createTrade(180), reported: createTrade(231) }, // +51
        { backtested: createTrade(90), reported: createTrade(141) }, // +51
        { backtested: createTrade(110), reported: createTrade(159) }, // +49
        { backtested: createTrade(130), reported: createTrade(180) }, // +50
        { backtested: createTrade(160), reported: createTrade(212) }, // +52
        { backtested: createTrade(140), reported: createTrade(190) }, // +50
      ]

      const result = calculatePairedTTest(pairs)
      expect(result).not.toBeNull()
      expect(result!.meanDifference).toBeCloseTo(50.3, 1)
      expect(result!.degreesOfFreedom).toBe(9)
      expect(result!.isSignificant).toBe(true)
      expect(result!.interpretation).toContain('significant')
      expect(result!.interpretation).toContain('higher')
    })

    it('should detect significant negative difference', () => {
      // Reported consistently lower by ~$30 with some variance
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(69) }, // -31
        { backtested: createTrade(200), reported: createTrade(171) }, // -29
        { backtested: createTrade(150), reported: createTrade(119) }, // -31
        { backtested: createTrade(120), reported: createTrade(91) }, // -29
        { backtested: createTrade(180), reported: createTrade(149) }, // -31
        { backtested: createTrade(90), reported: createTrade(60) }, // -30
        { backtested: createTrade(110), reported: createTrade(79) }, // -31
        { backtested: createTrade(130), reported: createTrade(101) }, // -29
        { backtested: createTrade(160), reported: createTrade(131) }, // -29
        { backtested: createTrade(140), reported: createTrade(109) }, // -31
      ]

      const result = calculatePairedTTest(pairs)
      expect(result).not.toBeNull()
      expect(result!.meanDifference).toBeCloseTo(-30.1, 1)
      expect(result!.isSignificant).toBe(true)
      expect(result!.interpretation).toContain('lower')
    })

    it('should calculate confidence interval correctly', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(145) }, // +45
        { backtested: createTrade(200), reported: createTrade(255) }, // +55
        { backtested: createTrade(150), reported: createTrade(198) }, // +48
        { backtested: createTrade(120), reported: createTrade(172) }, // +52
        { backtested: createTrade(180), reported: createTrade(230) }, // +50
      ]

      const result = calculatePairedTTest(pairs)
      expect(result).not.toBeNull()
      // With variance, CI should bracket the mean
      expect(result!.confidenceInterval[0]).toBeLessThan(result!.meanDifference)
      expect(result!.confidenceInterval[1]).toBeGreaterThan(result!.meanDifference)
      // Mean should be within CI
      expect(result!.meanDifference).toBeGreaterThanOrEqual(result!.confidenceInterval[0])
      expect(result!.meanDifference).toBeLessThanOrEqual(result!.confidenceInterval[1])
    })

    it('should handle high variance data', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(200) },
        { backtested: createTrade(200), reported: createTrade(150) },
        { backtested: createTrade(150), reported: createTrade(300) },
        { backtested: createTrade(120), reported: createTrade(80) },
        { backtested: createTrade(180), reported: createTrade(250) },
      ]

      const result = calculatePairedTTest(pairs)
      expect(result).not.toBeNull()
      expect(result!.standardError).toBeGreaterThan(0)
      // With high variance, likely not significant
      expect(result!.pValue).toBeGreaterThan(0.05)
    })
  })

  describe('calculatePearsonCorrelation', () => {
    it('should return null for empty array', () => {
      const result = calculatePearsonCorrelation([])
      expect(result).toBeNull()
    })

    it('should return null for single observation', () => {
      const pairs: MatchedPair[] = [
        {
          backtested: createTrade(100),
          reported: createTrade(110),
        },
      ]

      const result = calculatePearsonCorrelation(pairs)
      expect(result).toBeNull()
    })

    it('should return 1 for perfect positive correlation', () => {
      // Reported = Backtested + 50 (perfect linear relationship)
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(150) },
        { backtested: createTrade(200), reported: createTrade(250) },
        { backtested: createTrade(150), reported: createTrade(200) },
        { backtested: createTrade(120), reported: createTrade(170) },
        { backtested: createTrade(180), reported: createTrade(230) },
      ]

      const result = calculatePearsonCorrelation(pairs)
      expect(result).not.toBeNull()
      expect(result).toBeCloseTo(1, 5)
    })

    it('should return -1 for perfect negative correlation', () => {
      // Reported = 300 - Backtested
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(200) },
        { backtested: createTrade(200), reported: createTrade(100) },
        { backtested: createTrade(150), reported: createTrade(150) },
        { backtested: createTrade(120), reported: createTrade(180) },
        { backtested: createTrade(180), reported: createTrade(120) },
      ]

      const result = calculatePearsonCorrelation(pairs)
      expect(result).not.toBeNull()
      expect(result).toBeCloseTo(-1, 5)
    })

    it('should return 0 for no correlation', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(150) },
        { backtested: createTrade(200), reported: createTrade(150) },
        { backtested: createTrade(150), reported: createTrade(200) },
        { backtested: createTrade(120), reported: createTrade(100) },
        { backtested: createTrade(180), reported: createTrade(180) },
      ]

      const result = calculatePearsonCorrelation(pairs)
      expect(result).not.toBeNull()
      // Should be low correlation
      expect(Math.abs(result!)).toBeLessThan(0.5)
    })

    it('should handle identical values (no variance)', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(150) },
        { backtested: createTrade(100), reported: createTrade(150) },
        { backtested: createTrade(100), reported: createTrade(150) },
      ]

      const result = calculatePearsonCorrelation(pairs)
      expect(result).toBeNull() // No variance, can't calculate correlation
    })

    it('should calculate strong positive correlation', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(105) },
        { backtested: createTrade(200), reported: createTrade(210) },
        { backtested: createTrade(150), reported: createTrade(155) },
        { backtested: createTrade(120), reported: createTrade(125) },
        { backtested: createTrade(180), reported: createTrade(185) },
        { backtested: createTrade(90), reported: createTrade(95) },
        { backtested: createTrade(110), reported: createTrade(115) },
        { backtested: createTrade(130), reported: createTrade(135) },
        { backtested: createTrade(160), reported: createTrade(165) },
        { backtested: createTrade(140), reported: createTrade(145) },
      ]

      const result = calculatePearsonCorrelation(pairs)
      expect(result).not.toBeNull()
      expect(result).toBeGreaterThan(0.95) // Should be very high
    })
  })

  describe('calculateSpearmanCorrelation', () => {
    it('should return null for empty array', () => {
      const result = calculateSpearmanCorrelation([])
      expect(result).toBeNull()
    })

    it('should return 1 for monotonic increasing relationship', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(200), reported: createTrade(230) },
        { backtested: createTrade(150), reported: createTrade(165) },
        { backtested: createTrade(120), reported: createTrade(135) },
        { backtested: createTrade(180), reported: createTrade(200) },
      ]

      const result = calculateSpearmanCorrelation(pairs)
      expect(result).not.toBeNull()
      expect(result).toBeCloseTo(1, 5)
    })

    it('should be robust to outliers compared to Pearson', () => {
      // Same ranks, but with outlier in reported
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(200), reported: createTrade(1000) }, // Outlier
        { backtested: createTrade(150), reported: createTrade(165) },
        { backtested: createTrade(120), reported: createTrade(135) },
        { backtested: createTrade(180), reported: createTrade(200) },
      ]

      const pearson = calculatePearsonCorrelation(pairs)
      const spearman = calculateSpearmanCorrelation(pairs)

      expect(pearson).not.toBeNull()
      expect(spearman).not.toBeNull()

      // Spearman should still be high (ranks preserved)
      expect(spearman).toBeCloseTo(1, 5)
      // Pearson affected by outlier
      expect(pearson!).toBeLessThan(spearman!)
    })
  })

  describe('calculateCorrelationMetrics', () => {
    it('should return null for insufficient data', () => {
      const result = calculateCorrelationMetrics([])
      expect(result).toBeNull()
    })

    it('should provide complete metrics with interpretation', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(150) },
        { backtested: createTrade(200), reported: createTrade(250) },
        { backtested: createTrade(150), reported: createTrade(200) },
        { backtested: createTrade(120), reported: createTrade(170) },
        { backtested: createTrade(180), reported: createTrade(230) },
      ]

      const result = calculateCorrelationMetrics(pairs)
      expect(result).not.toBeNull()
      expect(result!.pearsonR).toBeCloseTo(1, 5)
      expect(result!.spearmanRho).toBeCloseTo(1, 5)
      expect(result!.interpretation).toContain('correlation')
      expect(result!.interpretation).toContain('positive')
    })

    it('should interpret strong correlation correctly', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(105) },
        { backtested: createTrade(200), reported: createTrade(210) },
        { backtested: createTrade(150), reported: createTrade(158) },
        { backtested: createTrade(120), reported: createTrade(128) },
        { backtested: createTrade(180), reported: createTrade(188) },
      ]

      const result = calculateCorrelationMetrics(pairs)
      expect(result).not.toBeNull()
      expect(result!.interpretation).toContain('strong')
      expect(result!.interpretation).toContain('positive')
    })

    it('should interpret weak correlation correctly', () => {
      // More random data to ensure weak/very weak correlation
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(200) },
        { backtested: createTrade(200), reported: createTrade(100) },
        { backtested: createTrade(150), reported: createTrade(190) },
        { backtested: createTrade(120), reported: createTrade(180) },
        { backtested: createTrade(180), reported: createTrade(110) },
        { backtested: createTrade(90), reported: createTrade(170) },
        { backtested: createTrade(110), reported: createTrade(130) },
      ]

      const result = calculateCorrelationMetrics(pairs)
      expect(result).not.toBeNull()
      // With this data pattern, correlation should be weak/moderate/negative
      // Just verify it doesn't claim "strong positive"
      expect(result!.interpretation).not.toContain('Strong positive')
    })
  })

  describe('calculateDualEquityCurves', () => {
    it('should return empty array for no pairs', () => {
      const result = calculateDualEquityCurves([])
      expect(result).toEqual([])
    })

    it('should calculate single trade equity curves', () => {
      const pairs: MatchedPair[] = [
        {
          backtested: createTrade(100),
          reported: createTrade(110),
        },
      ]

      const result = calculateDualEquityCurves(pairs, 0)
      expect(result).toHaveLength(1)
      expect(result[0].backtestedEquity).toBe(100)
      expect(result[0].reportedEquity).toBe(110)
      expect(result[0].difference).toBe(10)
      expect(result[0].tradeNumber).toBe(1)
    })

    it('should accumulate P/L correctly over multiple trades', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(50), reported: createTrade(60) },
        { backtested: createTrade(-30), reported: createTrade(-20) },
      ]

      const result = calculateDualEquityCurves(pairs, 0)
      expect(result).toHaveLength(3)

      // After trade 1: +100 backtested, +110 reported
      expect(result[0].backtestedEquity).toBe(100)
      expect(result[0].reportedEquity).toBe(110)
      expect(result[0].difference).toBe(10)

      // After trade 2: +150 backtested, +170 reported
      expect(result[1].backtestedEquity).toBe(150)
      expect(result[1].reportedEquity).toBe(170)
      expect(result[1].difference).toBe(20)

      // After trade 3: +120 backtested, +150 reported
      expect(result[2].backtestedEquity).toBe(120)
      expect(result[2].reportedEquity).toBe(150)
      expect(result[2].difference).toBe(30)
    })

    it('should handle initial capital', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(50), reported: createTrade(60) },
      ]

      const result = calculateDualEquityCurves(pairs, 10000)
      expect(result).toHaveLength(2)

      expect(result[0].backtestedEquity).toBe(10100)
      expect(result[0].reportedEquity).toBe(10110)

      expect(result[1].backtestedEquity).toBe(10150)
      expect(result[1].reportedEquity).toBe(10170)
    })

    it('should handle losing trades', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(-100), reported: createTrade(-90) },
        { backtested: createTrade(-50), reported: createTrade(-40) },
      ]

      const result = calculateDualEquityCurves(pairs, 1000)
      expect(result).toHaveLength(2)

      expect(result[0].backtestedEquity).toBe(900)
      expect(result[0].reportedEquity).toBe(910)
      expect(result[0].difference).toBe(10)

      expect(result[1].backtestedEquity).toBe(850)
      expect(result[1].reportedEquity).toBe(870)
      expect(result[1].difference).toBe(20)
    })

    it('should calculate percentage difference correctly', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
      ]

      const result = calculateDualEquityCurves(pairs, 0)
      expect(result[0].percentDifference).toBeCloseTo(10, 1) // 10% difference
    })

    it('should handle zero backtested equity in percentage calculation', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(0), reported: createTrade(10) },
      ]

      const result = calculateDualEquityCurves(pairs, 0)
      expect(result[0].percentDifference).toBe(0) // Avoid division by zero
    })

    it('should increment trade numbers correctly', () => {
      const pairs: MatchedPair[] = [
        { backtested: createTrade(10), reported: createTrade(10) },
        { backtested: createTrade(20), reported: createTrade(20) },
        { backtested: createTrade(30), reported: createTrade(30) },
      ]

      const result = calculateDualEquityCurves(pairs)
      expect(result[0].tradeNumber).toBe(1)
      expect(result[1].tradeNumber).toBe(2)
      expect(result[2].tradeNumber).toBe(3)
    })

    it('should preserve date information', () => {
      const trade1 = createTrade(100)
      trade1.dateOpened = new Date('2024-01-01')
      const trade2 = createTrade(110)
      trade2.dateOpened = new Date('2024-01-01')

      const pairs: MatchedPair[] = [
        { backtested: trade1, reported: trade2 },
      ]

      const result = calculateDualEquityCurves(pairs)
      expect(result[0].date).toBe(trade2.dateOpened.toISOString())
    })

    it('should show divergence accumulating over time', () => {
      // Backtested performance: +100, +100, +100
      // Reported performance: +110, +110, +110 (consistently 10% better)
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(100), reported: createTrade(110) },
        { backtested: createTrade(100), reported: createTrade(110) },
      ]

      const result = calculateDualEquityCurves(pairs, 0)

      // Difference should grow over time
      expect(result[0].difference).toBe(10)
      expect(result[1].difference).toBe(20)
      expect(result[2].difference).toBe(30)
    })

    it('should handle reported underperformance', () => {
      // Reported consistently worse than backtested
      const pairs: MatchedPair[] = [
        { backtested: createTrade(100), reported: createTrade(90) },
        { backtested: createTrade(100), reported: createTrade(90) },
      ]

      const result = calculateDualEquityCurves(pairs, 0)

      expect(result[0].difference).toBe(-10)
      expect(result[1].difference).toBe(-20)
      expect(result[0].reportedEquity).toBeLessThan(result[0].backtestedEquity)
      expect(result[1].reportedEquity).toBeLessThan(result[1].backtestedEquity)
    })

    it('should normalize P/L to per-contract when normalizeTo1Lot is true', () => {
      // Create trades with different contract sizes
      const trade1 = createTrade(200) // 2 contracts = $100 per contract
      trade1.contracts = 2
      const trade2 = createTrade(220) // 2 contracts = $110 per contract
      trade2.contracts = 2

      const trade3 = createTrade(300) // 3 contracts = $100 per contract
      trade3.contracts = 3
      const trade4 = createTrade(360) // 3 contracts = $120 per contract
      trade4.contracts = 3

      const pairs: MatchedPair[] = [
        { backtested: trade1, reported: trade2 },
        { backtested: trade3, reported: trade4 },
      ]

      // Without normalization: uses total P/L
      const resultTotal = calculateDualEquityCurves(pairs, 0, false)
      expect(resultTotal[0].backtestedEquity).toBe(200)
      expect(resultTotal[0].reportedEquity).toBe(220)
      expect(resultTotal[1].backtestedEquity).toBe(500) // 200 + 300
      expect(resultTotal[1].reportedEquity).toBe(580) // 220 + 360

      // With normalization: uses per-contract P/L
      const resultNormalized = calculateDualEquityCurves(pairs, 0, true)
      expect(resultNormalized[0].backtestedEquity).toBe(100) // 200 / 2
      expect(resultNormalized[0].reportedEquity).toBe(110) // 220 / 2
      expect(resultNormalized[1].backtestedEquity).toBe(200) // 100 + (300 / 3)
      expect(resultNormalized[1].reportedEquity).toBe(230) // 110 + (360 / 3)
    })

    it('should show consistent slippage per contract when normalized', () => {
      // All trades have +$10 per contract slippage but different contract sizes
      const trade1 = createTrade(100, 'bt1') // 1 contract
      trade1.contracts = 1
      const trade2 = createTrade(110, 'rpt1') // 1 contract, +$10
      trade2.contracts = 1

      const trade3 = createTrade(200, 'bt2') // 2 contracts
      trade3.contracts = 2
      const trade4 = createTrade(220, 'rpt2') // 2 contracts, +$20 total = +$10 per contract
      trade4.contracts = 2

      const pairs: MatchedPair[] = [
        { backtested: trade1, reported: trade2 },
        { backtested: trade3, reported: trade4 },
      ]

      const result = calculateDualEquityCurves(pairs, 0, true)

      // Both trades should show +$10 difference per contract
      expect(result[0].difference).toBe(10) // 110 - 100
      expect(result[1].difference).toBe(20) // (110 + 110) - (100 + 100)
    })
  })

  describe('calculateSeparateEquityCurves', () => {
    it('should return empty arrays for no trades', () => {
      const result = calculateSeparateEquityCurves([], [], 0, false)
      expect(result.backtested).toEqual([])
      expect(result.reported).toEqual([])
    })

    it('should calculate independent equity curves', () => {
      const backtestedTrades = [
        createTrade(100, 'bt1'),
        createTrade(50, 'bt2'),
        createTrade(-30, 'bt3'),
      ]
      const reportedTrades = [
        createTrade(110, 'rpt1'),
        createTrade(60, 'rpt2'),
      ]

      const result = calculateSeparateEquityCurves(backtestedTrades, reportedTrades, 0, false)

      // Backtested curve
      expect(result.backtested).toHaveLength(3)
      expect(result.backtested[0].equity).toBe(100)
      expect(result.backtested[1].equity).toBe(150)
      expect(result.backtested[2].equity).toBe(120)
      expect(result.backtested[0].tradeType).toBe('backtested')

      // Reported curve
      expect(result.reported).toHaveLength(2)
      expect(result.reported[0].equity).toBe(110)
      expect(result.reported[1].equity).toBe(170)
      expect(result.reported[0].tradeType).toBe('reported')
    })

    it('should handle different trade counts (unmatched trades)', () => {
      // More backtested trades than reported (some didn't execute)
      const backtestedTrades = [
        createTrade(100, 'bt1'),
        createTrade(100, 'bt2'),
        createTrade(100, 'bt3'),
        createTrade(100, 'bt4'),
      ]
      const reportedTrades = [
        createTrade(110, 'rpt1'),
        createTrade(110, 'rpt2'),
      ]

      const result = calculateSeparateEquityCurves(backtestedTrades, reportedTrades, 0, false)

      expect(result.backtested).toHaveLength(4)
      expect(result.reported).toHaveLength(2)
      expect(result.backtested[3].equity).toBe(400) // 4 trades
      expect(result.reported[1].equity).toBe(220) // 2 trades
    })

    it('should normalize to per-contract when requested', () => {
      const backtestedTrades = [
        Object.assign(createTrade(200, 'bt1'), { contracts: 2 }),
        Object.assign(createTrade(300, 'bt2'), { contracts: 3 }),
      ]
      const reportedTrades = [
        Object.assign(createTrade(220, 'rpt1'), { contracts: 2 }),
      ]

      const result = calculateSeparateEquityCurves(backtestedTrades, reportedTrades, 0, true)

      // Backtested: 200/2 + 300/3 = 100 + 100 = 200
      expect(result.backtested[0].equity).toBe(100)
      expect(result.backtested[1].equity).toBe(200)

      // Reported: 220/2 = 110
      expect(result.reported[0].equity).toBe(110)
    })

    it('should sort trades by date', () => {
      const trade1 = createTrade(100, 'bt1')
      trade1.dateOpened = new Date('2024-01-03')
      const trade2 = createTrade(200, 'bt2')
      trade2.dateOpened = new Date('2024-01-01')
      const trade3 = createTrade(300, 'bt3')
      trade3.dateOpened = new Date('2024-01-02')

      const result = calculateSeparateEquityCurves([trade1, trade2, trade3], [], 0, false)

      // Should be sorted: trade2 (01-01), trade3 (01-02), trade1 (01-03)
      expect(result.backtested[0].equity).toBe(200) // trade2
      expect(result.backtested[1].equity).toBe(500) // trade2 + trade3
      expect(result.backtested[2].equity).toBe(600) // all three
    })

    it('should handle initial capital', () => {
      const backtestedTrades = [createTrade(100, 'bt1')]
      const reportedTrades = [createTrade(110, 'rpt1')]

      const result = calculateSeparateEquityCurves(backtestedTrades, reportedTrades, 10000, false)

      expect(result.backtested[0].equity).toBe(10100)
      expect(result.reported[0].equity).toBe(10110)
    })

    it('should number trades sequentially', () => {
      const backtestedTrades = [
        createTrade(100, 'bt1'),
        createTrade(200, 'bt2'),
        createTrade(300, 'bt3'),
      ]

      const result = calculateSeparateEquityCurves(backtestedTrades, [], 0, false)

      expect(result.backtested[0].tradeNumber).toBe(1)
      expect(result.backtested[1].tradeNumber).toBe(2)
      expect(result.backtested[2].tradeNumber).toBe(3)
    })

    it('should preserve date as ISO string', () => {
      const trade = createTrade(100, 'bt1')
      trade.dateOpened = new Date('2024-01-15T10:30:00Z')

      const result = calculateSeparateEquityCurves([trade], [], 0, false)

      expect(result.backtested[0].date).toBe('2024-01-15T10:30:00.000Z')
    })
  })
})
