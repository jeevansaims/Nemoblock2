import { Trade } from '@/lib/models/trade'
import {
  calculatePremiumEfficiencyPercent,
  computeTotalPremium,
  computeTotalMaxProfit
} from '@/lib/metrics/trade-efficiency'

const baseTrade: Trade = {
  dateOpened: new Date('2025-10-07'),
  timeOpened: '09:33:00',
  openingPrice: 6751.7,
  legs: 'Test trade',
  premium: -1735,
  premiumPrecision: 'cents',
  closingPrice: 6690.39,
  dateClosed: new Date('2025-10-10'),
  timeClosed: '11:02:00',
  avgClosingCost: -1610,
  reasonForClose: 'Above Delta',
  pl: -9061.08,
  numContracts: 67,
  fundsAtClose: 964323.12,
  marginReq: 116245,
  strategy: 'Iron Condor',
  openingCommissionsFees: 477.04,
  closingCommissionsFees: 209.04,
  openingShortLongRatio: 0.78,
  closingShortLongRatio: 0.787,
  openingVix: 16.29,
  closingVix: 17.5,
  gap: 5.86,
  movement: 5.56,
  maxProfit: 18.44,
  maxLoss: -17.29
}

describe('trade-efficiency helpers', () => {
  it('normalises Option Omega premiums that are stored in cents', () => {
    const totalPremium = computeTotalPremium(baseTrade)
    expect(totalPremium).toBeDefined()
    expect(totalPremium!).toBeCloseTo(116245, 0)

    const efficiency = calculatePremiumEfficiencyPercent(baseTrade)
    expect(efficiency.percentage).toBeDefined()
    expect(efficiency.percentage!).toBeCloseTo(-7.8, 1)
    expect(efficiency.basis).toBe('premium')
    expect(efficiency.denominator).toBeCloseTo(116245, 0)
  })

  it('handles trades where premium is already expressed in total dollars', () => {
    const trade: Trade = {
      ...baseTrade,
      premium: -2400,
      premiumPrecision: 'dollars',
      numContracts: 2,
      marginReq: 4800,
      pl: 480,
      maxProfit: undefined,
      maxLoss: -2.5
    }

    const totalPremium = computeTotalPremium(trade)
    expect(totalPremium).toBeCloseTo(4800)

    const efficiency = calculatePremiumEfficiencyPercent(trade)
    expect(efficiency.percentage).toBeCloseTo(10)
    expect(efficiency.basis).toBe('premium')
  })

  it('falls back to max profit when premium is missing', () => {
    const trade: Trade = {
      ...baseTrade,
      premium: 0,
      premiumPrecision: 'dollars',
      numContracts: 10,
      pl: 250,
      marginReq: 0,
      maxProfit: 2.5,
      maxLoss: -5
    }

    const totalPremium = computeTotalPremium(trade)
    expect(totalPremium).toBeUndefined()

    const totalMaxProfit = computeTotalMaxProfit(trade)
    expect(totalMaxProfit).toBeCloseTo(2.5 * 10 * 100)

    const efficiency = calculatePremiumEfficiencyPercent(trade)
    expect(efficiency.basis).toBe('maxProfit')
    expect(efficiency.denominator).toBeCloseTo(2.5 * 10 * 100)
    expect(efficiency.percentage).toBeCloseTo(250 / (2.5 * 10 * 100) * 100)
  })
})
