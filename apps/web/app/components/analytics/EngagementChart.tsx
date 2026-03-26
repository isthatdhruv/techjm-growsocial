'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface TimelineEntry {
  date: string
  linkedin: number
  x: number
}

interface EngagementChartProps {
  data: TimelineEntry[]
  dateRange: string
}

export function EngagementChart({ data, dateRange }: EngagementChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-text-muted/40">
        No engagement data for this period
      </div>
    )
  }

  // Format date label based on range
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (dateRange === '7d') {
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: -10 }}>
        <defs>
          <linearGradient id="engLinkedIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="engX" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(10,10,20,0.9)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            fontSize: 12,
          }}
          labelFormatter={(label) => formatDate(label as string)}
          labelStyle={{ color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8, color: 'rgba(255,255,255,0.5)' }}
        />
        <Area
          type="monotone"
          dataKey="linkedin"
          stroke="#3b82f6"
          fill="url(#engLinkedIn)"
          strokeWidth={2}
          name="LinkedIn"
        />
        <Area
          type="monotone"
          dataKey="x"
          stroke="#9ca3af"
          fill="url(#engX)"
          strokeWidth={2}
          name="X (Twitter)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
