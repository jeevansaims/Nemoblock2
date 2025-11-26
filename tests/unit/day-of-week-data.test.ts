import { describe, it, expect } from '@jest/globals'
import { processChartData } from '@/lib/services/performance-snapshot'
import { Trade } from '@/lib/models/trade'

describe('Day of Week data', () => {
  it('averages percent returns using only trades with margin', async () => {
    const trades: Trade[] = [
      {
        dateOpened: new Date('2024-07-01T09:30:00Z'), // Monday
        timeOpened: '09:30:00',
        openingPrice: 100,
        legs: 'Call',
        premium: 1,
        pl: 500,
        numContracts: 1,
        fundsAtClose: 100500,
        marginReq: 5000,
        strategy: 'Test',
        openingCommissionsFees: 5,
        closingCommissionsFees: 5,
        openingShortLongRatio: 1,
        dateClosed: new Date('2024-07-02T09:30:00Z')
      },
      {
        dateOpened: new Date('2024-07-08T09:30:00Z'), // Monday
        timeOpened: '09:30:00',
        openingPrice: 100,
        legs: 'Put',
        premium: 1,
        pl: -200,
        numContracts: 1,
        fundsAtClose: 99800,
        marginReq: 0, // No margin -> should not influence percent avg
        strategy: 'Test',
        openingCommissionsFees: 5,
        closingCommissionsFees: 5,
        openingShortLongRatio: 1,
        dateClosed: new Date('2024-07-09T09:30:00Z')
      }
    ]

    const snapshot = await processChartData(trades)
    const monday = snapshot.dayOfWeekData.find(day => day.day === 'Monday')

    expect(monday).toBeDefined()
    expect(monday?.count).toBe(2)
    expect(monday?.avgPl).toBeCloseTo((500 - 200) / 2, 5)
    expect(monday?.avgPlPercent).toBeCloseTo(10, 5)
  })
})
