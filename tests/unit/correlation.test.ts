import { calculateCorrelationAnalytics, calculateCorrelationMatrix } from '@/lib/calculations/correlation';
import { Trade } from '@/lib/models/trade';

describe('Correlation Calculations', () => {
  it('should match pandas pearson correlation', () => {
    // Test data matching Python example
    const trades: Trade[] = [
      // Strategy1: [100, 200, -50, 0, 150]
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy1', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy1', pl: 200 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy1', pl: -50 } as Trade,
      { dateOpened: new Date('2025-01-04'), strategy: 'Strategy1', pl: 0 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy1', pl: 150 } as Trade,

      // Strategy2: [90, 210, -40, 10, 140]
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy2', pl: 90 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy2', pl: 210 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy2', pl: -40 } as Trade,
      { dateOpened: new Date('2025-01-04'), strategy: 'Strategy2', pl: 10 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy2', pl: 140 } as Trade,

      // Strategy3: [-100, 50, 200, -30, 80]
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy3', pl: -100 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy3', pl: 50 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy3', pl: 200 } as Trade,
      { dateOpened: new Date('2025-01-04'), strategy: 'Strategy3', pl: -30 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy3', pl: 80 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, { method: 'pearson' });

    console.log('Strategies:', result.strategies);
    console.log('Correlation Matrix:');
    result.correlationData.forEach((row, i) => {
      console.log(`${result.strategies[i]}:`, row.map(v => v.toFixed(6)));
    });

    // Expected values from pandas
    // Strategy1 x Strategy2 = 0.994914
    // Strategy1 x Strategy3 = -0.296639
    // Strategy2 x Strategy3 = -0.264021

    expect(result.strategies).toEqual(['Strategy1', 'Strategy2', 'Strategy3']);

    // Check diagonal (should be 1.0)
    expect(result.correlationData[0][0]).toBeCloseTo(1.0, 6);
    expect(result.correlationData[1][1]).toBeCloseTo(1.0, 6);
    expect(result.correlationData[2][2]).toBeCloseTo(1.0, 6);

    // Check Strategy1 x Strategy2
    expect(result.correlationData[0][1]).toBeCloseTo(0.994914, 5);
    expect(result.correlationData[1][0]).toBeCloseTo(0.994914, 5);

    // Check Strategy1 x Strategy3
    expect(result.correlationData[0][2]).toBeCloseTo(-0.296639, 5);
    expect(result.correlationData[2][0]).toBeCloseTo(-0.296639, 5);

    // Check Strategy2 x Strategy3
    expect(result.correlationData[1][2]).toBeCloseTo(-0.264021, 5);
    expect(result.correlationData[2][1]).toBeCloseTo(-0.264021, 5);
  });

  it('should have diagonal values of 1.0 for Kendall correlation', () => {
    // Test with strategies that trade on different days
    const trades: Trade[] = [
      // Strategy1 trades on days 1, 3, 5
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy1', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy1', pl: -50 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy1', pl: 150 } as Trade,

      // Strategy2 trades on days 2, 3, 4
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy2', pl: 90 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy2', pl: -40 } as Trade,
      { dateOpened: new Date('2025-01-04'), strategy: 'Strategy2', pl: 10 } as Trade,

      // Strategy3 trades on all days
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy3', pl: -100 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy3', pl: 50 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy3', pl: 200 } as Trade,
      { dateOpened: new Date('2025-01-04'), strategy: 'Strategy3', pl: -30 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy3', pl: 80 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, { method: 'kendall' });

    // Diagonal should always be 1.0 (strategy perfectly correlates with itself)
    expect(result.correlationData[0][0]).toBe(1.0);
    expect(result.correlationData[1][1]).toBe(1.0);
    expect(result.correlationData[2][2]).toBe(1.0);
  });

  it('should have diagonal values of 1.0 for Spearman correlation', () => {
    const trades: Trade[] = [
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy1', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy1', pl: -50 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy2', pl: 90 } as Trade,
      { dateOpened: new Date('2025-01-04'), strategy: 'Strategy2', pl: 10 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, { method: 'spearman' });

    expect(result.correlationData[0][0]).toBe(1.0);
    expect(result.correlationData[1][1]).toBe(1.0);
  });

  it('should calculate correlation only on overlapping trading days', () => {
    const trades: Trade[] = [
      // Strategy1 trades on days 1, 3
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy1', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy1', pl: 200 } as Trade,

      // Strategy2 trades on days 3, 5
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy2', pl: 150 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy2', pl: 250 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, { method: 'pearson' });

    // Should only have 1 overlapping day (day 3) - not enough for correlation
    // Should return 0 for different strategies when insufficient data
    expect(result.correlationData[0][1]).toBe(0.0);
    expect(result.correlationData[1][0]).toBe(0.0);

    // But diagonal should still be 1.0
    expect(result.correlationData[0][0]).toBe(1.0);
    expect(result.correlationData[1][1]).toBe(1.0);
  });

  it('should support zero-pad alignment for pearson', () => {
    const trades: Trade[] = [
      // Strategy1 trades on days 1, 3
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy1', pl: 100, numContracts: 1, openingPrice: 1, fundsAtClose: 0, marginReq: 1, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy1', pl: 200, numContracts: 1, openingPrice: 1, fundsAtClose: 0, marginReq: 1, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,

      // Strategy2 trades on days 3, 5
      { dateOpened: new Date('2025-01-03'), strategy: 'Strategy2', pl: 150, numContracts: 1, openingPrice: 1, fundsAtClose: 0, marginReq: 1, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,
      { dateOpened: new Date('2025-01-05'), strategy: 'Strategy2', pl: 250, numContracts: 1, openingPrice: 1, fundsAtClose: 0, marginReq: 1, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, {
      method: 'pearson',
      alignment: 'zero-pad',
    });

    expect(result.correlationData[0][1]).toBeCloseTo(-0.39736, 5);
    expect(result.correlationData[1][0]).toBeCloseTo(-0.39736, 5);
  });

  it('should normalize by margin when requested', () => {
    const trades: Trade[] = [
      // Strategy1
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy1', pl: 100, marginReq: 1000, numContracts: 1, openingPrice: 1, fundsAtClose: 0, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy1', pl: 100, marginReq: 2000, numContracts: 1, openingPrice: 1, fundsAtClose: 0, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,

      // Strategy2
      { dateOpened: new Date('2025-01-01'), strategy: 'Strategy2', pl: 100, marginReq: 2000, numContracts: 1, openingPrice: 1, fundsAtClose: 0, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'Strategy2', pl: 100, marginReq: 1000, numContracts: 1, openingPrice: 1, fundsAtClose: 0, openingCommissionsFees: 0, closingCommissionsFees: 0, openingShortLongRatio: 0 } as Trade,
    ];

    const raw = calculateCorrelationMatrix(trades, { method: 'pearson' });
    const normalized = calculateCorrelationMatrix(trades, {
      method: 'pearson',
      normalization: 'margin',
    });

    expect(raw.correlationData[0][1]).toBe(0);
    expect(normalized.correlationData[0][1]).toBeCloseTo(-1, 5);
  });

  it('should align using closed dates when requested', () => {
    const trades: Trade[] = [
      // Strategy1 trades close on Jan 3 and Jan 6
      { dateOpened: new Date('2025-01-01'), dateClosed: new Date('2025-01-03'), strategy: 'Strategy1', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-04'), dateClosed: new Date('2025-01-06'), strategy: 'Strategy1', pl: -50 } as Trade,

      // Strategy2 opens on different days but closes same days as Strategy1
      { dateOpened: new Date('2025-01-02'), dateClosed: new Date('2025-01-03'), strategy: 'Strategy2', pl: 200 } as Trade,
      { dateOpened: new Date('2025-01-05'), dateClosed: new Date('2025-01-06'), strategy: 'Strategy2', pl: -100 } as Trade,
    ];

    const opened = calculateCorrelationMatrix(trades, {
      method: 'pearson',
      dateBasis: 'opened',
    });

    const closed = calculateCorrelationMatrix(trades, {
      method: 'pearson',
      dateBasis: 'closed',
    });

    expect(opened.correlationData[0][1]).toBe(0);
    expect(closed.correlationData[0][1]).toBeCloseTo(1, 5);
  });

  it('should ignore trades without closed dates when using closed basis', () => {
    const trades: Trade[] = [
      { dateOpened: new Date('2025-01-01'), strategy: 'OpenOnly', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-02'), dateClosed: new Date('2025-01-03'), strategy: 'Closer', pl: 200 } as Trade,
      { dateOpened: new Date('2025-01-05'), dateClosed: new Date('2025-01-06'), strategy: 'Closer', pl: -50 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, {
      method: 'pearson',
      dateBasis: 'closed',
    });

    expect(result.strategies).toEqual(['Closer']);
  });

  it('should drop strategies with no valid normalized returns', () => {
    const trades: Trade[] = [
      { dateOpened: new Date('2025-01-01'), strategy: 'NoMargin', pl: 100 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'NoMargin', pl: -50 } as Trade,
      { dateOpened: new Date('2025-01-01'), strategy: 'WithMargin', pl: 200, marginReq: 2000 } as Trade,
      { dateOpened: new Date('2025-01-02'), strategy: 'WithMargin', pl: -100, marginReq: 1000 } as Trade,
    ];

    const result = calculateCorrelationMatrix(trades, {
      method: 'pearson',
      normalization: 'margin',
    });

    expect(result.strategies).toEqual(['WithMargin']);
  });

  it('should report signed average correlation in analytics', () => {
    const matrix = {
      strategies: ['A', 'B', 'C'],
      correlationData: [
        [1, 0.5, -0.5],
        [0.5, 1, 0.2],
        [-0.5, 0.2, 1],
      ],
    };

    const analytics = calculateCorrelationAnalytics(matrix);
    const expectedAverage = (0.5 - 0.5 + 0.2) / 3;

    expect(analytics.averageCorrelation).toBeCloseTo(expectedAverage, 5);
  });
});
