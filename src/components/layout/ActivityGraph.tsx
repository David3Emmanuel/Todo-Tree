import {
  BarChart,
  Bar,
  XAxis,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { DaySnapshot } from '../todo-tree/useActivityHistory'

interface ActivityGraphProps {
  history: DaySnapshot[]
}

type ChartRow = {
  label: string
  date: string
  done: number
  remaining: number
  urgencyColor: string
  urgency: number // fixed height strip
  total: number
  todayCount: number
  soonCount: number
  empty: boolean
}

const URGENCY_STRIP_HEIGHT = 3
const AMBER = '#cf7d3c'
const REMAINING = '#2a2724'
const EMPTY_BAR = '#1c1a18'

function buildChartData(history: DaySnapshot[]): ChartRow[] {
  const rows: ChartRow[] = []
  const byDate = new Map(history.map((s) => [s.date, s]))

  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const snap = byDate.get(dateStr)
    const label = String(d.getDate())

    if (!snap) {
      rows.push({
        label,
        date: dateStr,
        done: 0,
        remaining: 0,
        urgencyColor: 'transparent',
        urgency: URGENCY_STRIP_HEIGHT,
        total: 0,
        todayCount: 0,
        soonCount: 0,
        empty: true,
      })
    } else {
      const urgencyColor =
        snap.today > 0 ? '#e8614a' : snap.soon > 0 ? '#e8c547' : 'transparent'
      rows.push({
        label,
        date: dateStr,
        done: snap.done,
        remaining: snap.total - snap.done,
        urgencyColor,
        urgency: URGENCY_STRIP_HEIGHT,
        total: snap.total,
        todayCount: snap.today,
        soonCount: snap.soon,
        empty: snap.total === 0,
      })
    }
  }

  return rows
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: ChartRow }[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  if (row.empty) return null

  return (
    <div className="activity-tooltip">
      <div style={{ color: '#9a938c', marginBottom: '0.15rem' }}>
        {formatDate(row.date)}
      </div>
      <div>
        {row.done}/{row.total} done
      </div>
      {row.todayCount > 0 && (
        <div style={{ color: '#e8614a' }}>{row.todayCount} today</div>
      )}
      {row.soonCount > 0 && (
        <div style={{ color: '#e8c547' }}>{row.soonCount} soon</div>
      )}
    </div>
  )
}

export function ActivityGraph({ history }: ActivityGraphProps) {
  const data = buildChartData(history)

  return (
    <div className="activity-graph">
      <ResponsiveContainer width="100%" height={88}>
        <BarChart
          data={data}
          barCategoryGap="20%"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#8d8681', fontSize: 9, fontFamily: 'Manrope' }}
            interval={0}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />

          {/* Done — bottom of stack, amber */}
          <Bar dataKey="done" stackId="tasks" fill={AMBER} radius={[0, 0, 2, 2]} isAnimationActive animationDuration={400}>
            {data.map((row, i) => (
              <Cell key={i} fill={row.empty ? EMPTY_BAR : AMBER} fillOpacity={row.empty ? 0.3 : 1} />
            ))}
          </Bar>

          {/* Remaining — top of stack, dark */}
          <Bar dataKey="remaining" stackId="tasks" fill={REMAINING} radius={[2, 2, 0, 0]} isAnimationActive animationDuration={400}>
            {data.map((row, i) => (
              <Cell key={i} fill={row.empty ? 'transparent' : REMAINING} />
            ))}
          </Bar>

          {/* Urgency strip — separate stack, thin colored bar */}
          <Bar dataKey="urgency" stackId="strip" radius={[1, 1, 1, 1]} isAnimationActive={false}>
            {data.map((row, i) => (
              <Cell key={i} fill={row.urgencyColor} fillOpacity={row.empty ? 0 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
