import { formatNumber } from '../../lib/format.js'
/** Responsive SVG growth plot. Calendar dates are evenly spaced, including zero-signup days. */
import { tr } from '../../localization/i18n.js'
import { useTranslation } from 'react-i18next'
import Box from '@mui/joy/Box'
import type { AdminUserGrowth } from '@persistent/shared'
import { growthDateLabel } from './userGrowth.js'

export type GrowthMetric = 'total' | 'signups'
type Point = AdminUserGrowth['points'][number]

/** Draw a zero-based count axis and allow pointer exploration; the card supplies keyboard controls. */
export function UserGrowthPlot({ points, metric, selectedIndex, onSelect }: {
  points: Point[]
  metric: GrowthMetric
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  useTranslation()
  const width = 400
  const height = 240
  const left = 44
  const right = width - 16
  const top = 16
  const bottom = height - 38
  const maximum = Math.max(4, Math.ceil(Math.max(0, ...points.map((point) => point[metric])) / 4) * 4)
  const x = (index: number) => left + ((index + 0.5) / Math.max(1, points.length)) * (right - left)
  const y = (value: number) => bottom - (value / maximum) * (bottom - top)
  const selected = points[selectedIndex]
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point[metric])}`).join(' ')
  const tickIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
    .filter((index) => index >= 0 && index < points.length)
  const title = tr(metric === 'total' ? 'Total users over time' : 'Daily sign-ups')

  return (
    <Box sx={{ color: 'primary.500', width: '100%', '& text': { fill: 'var(--joy-palette-text-secondary)', fontFamily: 'inherit', fontSize: '15px' } }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr("{{v0}}. Use the date slider or data table for exact counts.", { v0: title })}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (!bounds.width || !points.length) return
          const plotX = (event.clientX - bounds.left) * width / bounds.width
          onSelect(Math.max(0, Math.min(points.length - 1, Math.floor((plotX - left) / (right - left) * points.length))))
        }}>
        <title>{title}</title>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = tick * maximum / 4
          return <g key={tick}>
            <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--joy-palette-divider)" />
            <text x={left - 8} y={y(value) + 4} textAnchor="end">{formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 })}</text>
          </g>
        })}
        {metric === 'total' ? <>
          <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" />
          {points.length === 1 && <circle cx={x(0)} cy={y(points[0]!.total)} r="4" fill="currentColor" />}
        </> : points.map((point, index) => (
          <rect key={point.date} x={x(index) - (right - left) / points.length * 0.4}
            y={y(point.signups)} width={(right - left) / points.length * 0.8}
            height={bottom - y(point.signups)} fill="currentColor" opacity={index === selectedIndex ? 1 : 0.65} />
        ))}
        {selected && <g>
          <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} stroke="currentColor" strokeDasharray="3 3" opacity="0.6" />
          <circle cx={x(selectedIndex)} cy={y(selected[metric])} r="4" fill="currentColor" />
        </g>}
        {tickIndices.map((index, position) => (
          <text key={index} x={x(index)} y={height - 8} textAnchor={position === 0 ? 'start' : position === tickIndices.length - 1 ? 'end' : 'middle'}>
            {growthDateLabel(points[index]!.date)}
          </text>
        ))}
      </svg>
    </Box>
  )
}
