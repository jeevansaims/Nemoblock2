/** @jest-environment node */

/**
 * Integration tests for reconciliation statistical analysis
 *
 * Tests the full pipeline from CSV loading through statistical analysis
 * using real test data when available, falling back to mock data.
 */

import 'fake-indexeddb/auto'
import { CsvTestDataLoader } from '../data/csv-loader'
import { initializeDatabase, deleteDatabase } from '@/lib/db'
import { addTrades } from '@/lib/db/trades-store'
import { addReportingTrades } from '@/lib/db/reporting-logs-store'
import { buildTradeReconciliation } from '@/lib/services/trade-reconciliation'
import { StrategyAlignment } from '@/lib/models/strategy-alignment'

describe('Reconciliation Statistics Integration', () => {
  beforeAll(async () => {
    await initializeDatabase()
  })

  afterAll(async () => {
    await deleteDatabase()
  })

  describe('Statistical Analysis with CSV Data', () => {
    it('should calculate t-test and correlation for reconciled trades', async () => {
      // Load test data (will use CSV if available, mock otherwise)
      const testData = await CsvTestDataLoader.loadTestData()

      console.log('Test data sources:', {
        trades: testData.sources.trades,
        reporting: testData.sources.reporting,
        tradeCount: testData.trades.length,
        reportingCount: testData.reportingTrades.length,
      })

      // Skip test if no reporting trades available
      if (testData.reportingTrades.length === 0) {
        console.log('No reporting trades available, skipping reconciliation test')
        return
      }

      const blockId = 'stats-integration-block'

      // Store trades in IndexedDB
      await addTrades(blockId, testData.trades)
      await addReportingTrades(blockId, testData.reportingTrades)

      // Get unique strategies from both datasets
      const backtestedStrategies = Array.from(
        new Set(testData.trades.map(t => t.strategy))
      )
      const reportedStrategies = Array.from(
        new Set(testData.reportingTrades.map(t => t.strategy))
      )

      console.log('Strategies found:', {
        backtested: backtestedStrategies,
        reported: reportedStrategies,
      })

      // Create alignments for matching strategies
      const alignments: StrategyAlignment[] = []

      // Try to match strategies (simple case: exact match)
      for (const backtestedStrat of backtestedStrategies) {
        if (reportedStrategies.includes(backtestedStrat)) {
          alignments.push({
            id: `alignment-${alignments.length}`,
            liveStrategies: [backtestedStrat],
            reportingStrategies: [backtestedStrat],
          })
        }
      }

      // If no exact matches, create alignment between first strategies
      if (alignments.length === 0 && backtestedStrategies.length > 0 && reportedStrategies.length > 0) {
        alignments.push({
          id: 'alignment-0',
          liveStrategies: [backtestedStrategies[0]],
          reportingStrategies: [reportedStrategies[0]],
        })
      }

      if (alignments.length === 0) {
        console.log('No strategy alignments could be created')
        return
      }

      // Build reconciliation with statistical analysis
      const reconciliation = await buildTradeReconciliation(blockId, alignments)

      expect(reconciliation.alignments).toHaveLength(alignments.length)

      // Check each alignment has statistical metrics
      reconciliation.alignments.forEach((alignment, index) => {
        console.log(`\nAlignment ${index}:`, {
          backtestedStrategy: alignment.backtestedStrategy,
          reportedStrategy: alignment.reportedStrategy,
          backtestedTrades: alignment.backtestedTrades.length,
          reportedTrades: alignment.reportedTrades.length,
          metrics: {
            matchRate: alignment.metrics.matchRate,
            slippagePerContract: alignment.metrics.slippagePerContract,
            hasTTest: alignment.metrics.tTest !== null,
            hasCorrelation: alignment.metrics.correlation !== null,
          },
        })

        // Verify metrics structure
        expect(alignment.metrics).toBeDefined()
        expect(alignment.metrics.backtested).toBeDefined()
        expect(alignment.metrics.reported).toBeDefined()
        expect(alignment.metrics.delta).toBeDefined()

        // If we have matched pairs, we should have statistical analysis
        const hasPairs = alignment.sessions.some(session =>
          session.items.some(item => item.isPaired)
        )

        if (hasPairs) {
          // T-test should be available with 2+ pairs
          expect(alignment.metrics.tTest).toBeDefined()

          if (alignment.metrics.tTest) {
            console.log('  T-Test Results:', {
              tStatistic: alignment.metrics.tTest.tStatistic.toFixed(3),
              pValue: alignment.metrics.tTest.pValue.toFixed(4),
              meanDifference: alignment.metrics.tTest.meanDifference.toFixed(2),
              isSignificant: alignment.metrics.tTest.isSignificant,
              interpretation: alignment.metrics.tTest.interpretation,
            })

            // Verify t-test structure
            expect(typeof alignment.metrics.tTest.tStatistic).toBe('number')
            expect(typeof alignment.metrics.tTest.pValue).toBe('number')
            expect(typeof alignment.metrics.tTest.meanDifference).toBe('number')
            expect(typeof alignment.metrics.tTest.isSignificant).toBe('boolean')
            expect(alignment.metrics.tTest.interpretation).toBeTruthy()
            expect(alignment.metrics.tTest.confidenceInterval).toHaveLength(2)

            // P-value should be between 0 and 1
            expect(alignment.metrics.tTest.pValue).toBeGreaterThanOrEqual(0)
            expect(alignment.metrics.tTest.pValue).toBeLessThanOrEqual(1)
          }

          // Correlation should be available with 2+ pairs
          expect(alignment.metrics.correlation).toBeDefined()

          if (alignment.metrics.correlation) {
            console.log('  Correlation Results:', {
              pearsonR: alignment.metrics.correlation.pearsonR.toFixed(3),
              spearmanRho: alignment.metrics.correlation.spearmanRho.toFixed(3),
              interpretation: alignment.metrics.correlation.interpretation,
            })

            // Verify correlation structure
            expect(typeof alignment.metrics.correlation.pearsonR).toBe('number')
            expect(typeof alignment.metrics.correlation.spearmanRho).toBe('number')
            expect(alignment.metrics.correlation.interpretation).toBeTruthy()

            // Correlation coefficients should be between -1 and 1
            expect(alignment.metrics.correlation.pearsonR).toBeGreaterThanOrEqual(-1)
            expect(alignment.metrics.correlation.pearsonR).toBeLessThanOrEqual(1)
            expect(alignment.metrics.correlation.spearmanRho).toBeGreaterThanOrEqual(-1)
            expect(alignment.metrics.correlation.spearmanRho).toBeLessThanOrEqual(1)
          }
        } else {
          // No pairs means no statistical analysis possible
          console.log('  No paired trades for statistical analysis')
        }
      })
    })

    it('should handle case with no matching trades gracefully', async () => {
      const testData = await CsvTestDataLoader.loadTestData()

      if (testData.reportingTrades.length === 0) {
        console.log('No reporting trades available, skipping no-match test')
        return
      }

      const blockId = 'stats-no-match-block'

      // Store only backtested trades (no reporting trades)
      await addTrades(blockId, testData.trades)

      // Create alignment but with no reporting trades stored
      const alignments: StrategyAlignment[] = [{
        id: 'alignment-no-match',
        liveStrategies: [testData.trades[0]?.strategy ?? 'Test'],
        reportingStrategies: ['NonexistentStrategy'],
      }]

      const reconciliation = await buildTradeReconciliation(blockId, alignments)

      // Should handle gracefully with null statistical results
      expect(reconciliation.alignments).toHaveLength(1)

      const alignment = reconciliation.alignments[0]
      expect(alignment.metrics.tTest).toBeNull()
      expect(alignment.metrics.correlation).toBeNull()
      expect(alignment.metrics.matchRate).toBe(0)
    })

    it('should calculate statistics for single-strategy alignment', async () => {
      const testData = await CsvTestDataLoader.loadTestData()

      if (testData.trades.length === 0 || testData.reportingTrades.length === 0) {
        console.log('Insufficient test data, skipping single-strategy test')
        return
      }

      const blockId = 'stats-single-strategy-block'

      // Filter to single strategy
      const strategy = testData.trades[0].strategy
      const strategyTrades = testData.trades.filter(t => t.strategy === strategy)
      const strategyReporting = testData.reportingTrades.filter(t => t.strategy === strategy)

      if (strategyTrades.length === 0 || strategyReporting.length === 0) {
        console.log('No matching strategy found, skipping test')
        return
      }

      await addTrades(blockId, strategyTrades)
      await addReportingTrades(blockId, strategyReporting)

      const alignments: StrategyAlignment[] = [{
        id: 'alignment-single',
        liveStrategies: [strategy],
        reportingStrategies: [strategy],
      }]

      const reconciliation = await buildTradeReconciliation(blockId, alignments)

      expect(reconciliation.alignments).toHaveLength(1)

      const alignment = reconciliation.alignments[0]

      console.log('Single strategy alignment:', {
        strategy,
        backtestedCount: alignment.backtestedTrades.length,
        reportedCount: alignment.reportedTrades.length,
        matchedPairs: alignment.sessions.reduce((sum, s) =>
          sum + s.items.filter(i => i.isPaired).length, 0
        ),
      })

      // Verify basic metrics (may be filtered by date range)
      expect(alignment.metrics.backtested.tradeCount).toBeGreaterThan(0)
      expect(alignment.metrics.reported.tradeCount).toBeGreaterThan(0)
      expect(alignment.backtestedTrades.length).toBeGreaterThan(0)
      expect(alignment.reportedTrades.length).toBeGreaterThan(0)

      // Statistical analysis availability depends on matched pairs
      const pairCount = alignment.sessions.reduce((sum, s) =>
        sum + s.items.filter(i => i.isPaired).length, 0
      )

      if (pairCount >= 2) {
        expect(alignment.metrics.tTest).not.toBeNull()
        expect(alignment.metrics.correlation).not.toBeNull()
      } else {
        // With < 2 pairs, may have null or limited stats
        console.log('Insufficient pairs for full statistical analysis')
      }
    })
  })

  describe('Statistical Edge Cases', () => {
    it('should handle identical P/L values', async () => {
      // This tests the case where all paired trades have identical performance
      // which would result in zero variance

      const blockId = 'stats-identical-block'

      // Create identical trades with same timestamps for matching
      const identicalTrades = Array.from({ length: 5 }, (_, i) => ({
        dateOpened: new Date(`2024-01-0${i + 1}T10:00:00`),
        timeOpened: '10:00:00',
        openingPrice: 100,
        legs: 'CALL',
        premium: 500,
        pl: 100, // Identical P/L
        numContracts: 1,
        fundsAtClose: 10100,
        marginReq: 1000,
        strategy: 'IdenticalTest',
        openingCommissionsFees: 1,
        closingCommissionsFees: 1,
        openingShortLongRatio: 0.5,
      }))

      const identicalReporting = Array.from({ length: 5 }, (_, i) => ({
        strategy: 'IdenticalTest',
        dateOpened: new Date(`2024-01-0${i + 1}T10:00:00`), // Same timestamp
        openingPrice: 100,
        legs: 'CALL',
        initialPremium: 500,
        numContracts: 1,
        pl: 100, // Identical P/L
      }))

      await addTrades(blockId, identicalTrades)
      await addReportingTrades(blockId, identicalReporting)

      const alignments: StrategyAlignment[] = [{
        id: 'alignment-identical',
        liveStrategies: ['IdenticalTest'],
        reportingStrategies: ['IdenticalTest'],
      }]

      const reconciliation = await buildTradeReconciliation(blockId, alignments)
      const alignment = reconciliation.alignments[0]

      console.log('Identical trades test - pairs:', alignment.sessions.reduce((sum, s) =>
        sum + s.items.filter(i => i.isPaired).length, 0
      ))

      // Check if we have matched pairs
      const pairCount = alignment.sessions.reduce((sum, s) =>
        sum + s.items.filter(i => i.isPaired).length, 0
      )

      if (pairCount >= 2) {
        // Should have stats
        expect(alignment.metrics.tTest).not.toBeNull()

        if (alignment.metrics.tTest) {
          // Mean difference should be 0 (identical P/L)
          expect(alignment.metrics.tTest.meanDifference).toBeCloseTo(0, 5)
          // Should not be significant (no difference)
          expect(alignment.metrics.tTest.isSignificant).toBe(false)
        }

        // Correlation may be null with zero variance (both datasets identical)
        // This is mathematically correct - correlation is undefined when variance is zero
        if (alignment.metrics.correlation) {
          console.log('Correlation with identical values:', alignment.metrics.correlation)
        } else {
          console.log('Correlation is null (zero variance)')
        }
      } else {
        console.log('No pairs matched - may need to adjust matching logic or timestamps')
        // Without pairs, stats should be null
        expect(alignment.metrics.tTest).toBeNull()
        expect(alignment.metrics.correlation).toBeNull()
      }
    })
  })

  describe('Normalization Behaviour', () => {
    it('normalizes matched slippage metrics to per-contract values', async () => {
      const blockId = 'stats-normalize-slippage-block'

      const baseDate = new Date(2024, 0, 2, 9, 30, 0)
      const laterDate = new Date(2024, 0, 3, 11, 15, 0)

      await addTrades(blockId, [
        {
          dateOpened: baseDate,
          timeOpened: '09:30:00',
          openingPrice: 100,
          legs: 'Test Spread A',
          premium: 500,
          pl: 200,
          numContracts: 5,
          fundsAtClose: 10000,
          marginReq: 5000,
          strategy: 'NormalizationTest',
          openingCommissionsFees: 5,
          closingCommissionsFees: 5,
          openingShortLongRatio: 0.5,
          closingShortLongRatio: 0.5,
        },
        {
          dateOpened: laterDate,
          timeOpened: '11:15:00',
          openingPrice: 120,
          legs: 'Test Spread B',
          premium: 400,
          pl: 150,
          numContracts: 2,
          fundsAtClose: 15000,
          marginReq: 6000,
          strategy: 'NormalizationTest',
          openingCommissionsFees: 4,
          closingCommissionsFees: 4,
          openingShortLongRatio: 0.6,
          closingShortLongRatio: 0.55,
        },
      ])

      await addReportingTrades(blockId, [
        {
          strategy: 'NormalizationTest',
          dateOpened: baseDate,
          openingPrice: 100,
          legs: 'Test Spread A',
          initialPremium: 525,
          numContracts: 5,
          pl: 205,
        },
        {
          strategy: 'NormalizationTest',
          dateOpened: laterDate,
          openingPrice: 120,
          legs: 'Test Spread B',
          initialPremium: 406,
          numContracts: 2,
          pl: 152,
        },
      ])

      const alignments: StrategyAlignment[] = [{
        id: 'alignment-normalization',
        liveStrategies: ['NormalizationTest'],
        reportingStrategies: ['NormalizationTest'],
      }]

      const reconciliationActual = await buildTradeReconciliation(blockId, alignments, false)
      const reconciliationNormalized = await buildTradeReconciliation(blockId, alignments, true)

      expect(reconciliationActual.alignments).toHaveLength(1)
      expect(reconciliationNormalized.alignments).toHaveLength(1)

      const metricsActual = reconciliationActual.alignments[0].metrics
      const metricsNormalized = reconciliationNormalized.alignments[0].metrics

      expect(metricsActual.matched.tradeCount).toBe(2)
      expect(metricsActual.matched.totalSlippage).toBeCloseTo(31, 6)
      expect(metricsActual.slippagePerContract).toBeCloseTo(31 / 7, 6)
      expect(metricsActual.matched.backtestedAvgPremiumPerContract).toBeCloseTo((500 + 400) / 7, 6)
      expect(metricsActual.matched.backtestedContractBaseline).toBeCloseTo(7)

      expect(metricsNormalized.matched.tradeCount).toBe(2)
      expect(metricsNormalized.matched.totalSlippage).toBeCloseTo(8, 6)
      expect(metricsNormalized.slippagePerContract).toBeCloseTo(4, 6)
      expect(metricsNormalized.matched.backtestedAvgPremiumPerContract).toBeCloseTo((100 + 200) / 2, 6)
      expect(metricsNormalized.matched.backtestedContractBaseline).toBeCloseTo(2)

      const avgSlippagePerTradeActual = metricsActual.matched.totalSlippage / metricsActual.matched.tradeCount
      const avgSlippagePerTradeNormalized = metricsNormalized.matched.totalSlippage / metricsNormalized.matched.tradeCount

      expect(avgSlippagePerTradeActual).toBeCloseTo(15.5, 6)
      expect(avgSlippagePerTradeNormalized).toBeCloseTo(4, 6)

      expect(metricsActual.tTest).not.toBeNull()
      expect(metricsNormalized.tTest).not.toBeNull()

      if (metricsActual.tTest && metricsNormalized.tTest) {
        expect(metricsActual.tTest.meanDifference).toBeCloseTo(3.5, 6)
        expect(metricsNormalized.tTest.meanDifference).toBeCloseTo(1, 6)
      }
    })
  })
})
