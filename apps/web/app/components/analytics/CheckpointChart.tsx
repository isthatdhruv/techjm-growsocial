'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface CheckpointData {
  checkpoint: string
  likes: number
  comments: number
  shares: number
  impressions: number
}

interface CheckpointChartProps {
  checkpoints: CheckpointData[]
  id?: string
}

export function CheckpointChart({ checkpoints, id = 'default' }: CheckpointChartProps) {
  if (!checkpoints.length) {
    return <div className="flex h-[120px] items-center justify-center text-xs text-text-muted/40">No checkpoint data</div>
  }

  return (
    <div style={{ width: 300, height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={checkpoints} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`cp-likes-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`cp-comments-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`cp-shares-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="checkpoint"
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(10,10,20,0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              fontSize: 11,
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
          />
          <Area type="monotone" dataKey="likes" stroke="#3b82f6" fill={`url(#cp-likes-${id})`} strokeWidth={1.5} name="Likes" />
          <Area type="monotone" dataKey="comments" stroke="#22c55e" fill={`url(#cp-comments-${id})`} strokeWidth={1.5} name="Comments" />
          <Area type="monotone" dataKey="shares" stroke="#f59e0b" fill={`url(#cp-shares-${id})`} strokeWidth={1.5} name="Shares" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
