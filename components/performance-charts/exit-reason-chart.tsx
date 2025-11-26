"use client"

import { useMemo } from 'react'
import type { Layout, PlotData } from 'plotly.js'
import { ChartWrapper } from './chart-wrapper'
import { usePerformanceStore } from '@/lib/stores/performance-store'

interface ExitReasonChartProps {
  className?: string
}

export function ExitReasonChart({ className }: ExitReasonChartProps) {
  const { data } = usePerformanceStore()

  const { plotData, layout } = useMemo(() => {
    if (!data?.exitReasonBreakdown || data.exitReasonBreakdown.length === 0) {
      return { plotData: [], layout: {} }
    }

    const sorted = [...data.exitReasonBreakdown].sort((a, b) => b.count - a.count)
    const reasons = sorted.map(item => item.reason)

    const countTrace: Partial<PlotData> = {
      x: reasons,
      y: sorted.map(item => item.count),
      type: 'bar',
      name: 'Trade Count',
      marker: {
        color: '#6366f1'
      },
      hovertemplate: '%{x}<br>Trades: %{y}<extra></extra>'
    }

    const avgPlTrace: Partial<PlotData> = {
      x: reasons,
      y: sorted.map(item => item.avgPl),
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Avg P/L ($)',
      yaxis: 'y2',
      marker: {
        size: 8,
        color: sorted.map(item => item.avgPl >= 0 ? '#22c55e' : '#ef4444')
      },
      hovertemplate: '%{x}<br>Avg P/L: $%{y:.2f}<extra></extra>'
    }

    const chartLayout: Partial<Layout> = {
      xaxis: {
        title: { text: 'Exit Reason', standoff: 20 },
        tickangle: -45
      },
      yaxis: {
        title: { text: 'Trade Count' }
      },
      yaxis2: {
        title: { text: 'Average P/L ($)' },
        overlaying: 'y',
        side: 'right'
      },
      barmode: 'group',
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1
      },
      margin: {
        r: 80,
        b: 120
      }
    }

    return { plotData: [countTrace, avgPlTrace], layout: chartLayout }
  }, [data?.exitReasonBreakdown])

  const tooltip = {
    flavor: 'Which exits add value and which ones leak capital?',
    detailed:
      'Tally exit reasons to see where discretionary overrides, stops, or assignment drive the best and worst outcomes. Consider codifying playbooks around the top performers.'
  }

  return (
    <ChartWrapper
      title="🚪 Exit Diagnostics"
      description="Counts and average P/L by closing reason"
      className={className}
      data={plotData as PlotData[]}
      layout={layout}
      style={{ height: '320px' }}
      tooltip={tooltip}
    />
  )
}
