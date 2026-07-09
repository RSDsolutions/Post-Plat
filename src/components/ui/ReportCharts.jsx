import React from 'react';

const BAR_ACCENT_CLASSES = {
  emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
  blue: { bar: 'bg-blue-500', text: 'text-blue-400' },
  amber: { bar: 'bg-amber-500', text: 'text-amber-400' },
  purple: { bar: 'bg-purple-500', text: 'text-purple-400' },
  pink: { bar: 'bg-pink-500', text: 'text-pink-400' },
  red: { bar: 'bg-red-500', text: 'text-red-400' }
};

const TREND_COLORS = { emerald: '#10b981', blue: '#3b82f6', amber: '#f59e0b', purple: '#a855f7', pink: '#ec4899', red: '#ef4444' };

const EMPTY_MESSAGE = 'Sin datos para este período';

// Ranked horizontal bar list (top products/customers/cashiers) - same
// visual language as the original StoreReports.jsx top-products card,
// generalized for reuse.
export function BarList({ data, accent = 'emerald', emptyMessage = EMPTY_MESSAGE }) {
  if (!data || data.length === 0) {
    return <p className="text-zinc-500 text-center py-10 text-sm">{emptyMessage}</p>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  const cls = BAR_ACCENT_CLASSES[accent] || BAR_ACCENT_CLASSES.emerald;
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <span className={`font-bold text-xs ${cls.text}`}>{i + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-medium text-zinc-200 truncate">{d.label}</span>
              <span className="text-sm font-bold text-zinc-100 flex-shrink-0">{d.formatted ?? d.value}</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${cls.bar}`} style={{ width: `${Math.max(3, (d.value / max) * 100)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Donut chart via the classic stroke-dasharray trick on stacked <circle>
// strokes - no charting library needed. Rotating the whole <svg> -90deg
// moves the arc start from 3 o'clock to 12 o'clock.
export function DonutChart({ data, centerLabel, formatValue = (v) => String(v), emptyMessage = EMPTY_MESSAGE }) {
  const total = (data || []).reduce((s, d) => s + (d.value || 0), 0);
  if (!data || data.length === 0 || total <= 0) {
    return <p className="text-zinc-500 text-center py-10 text-sm">{emptyMessage}</p>;
  }
  const size = 180;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#27272a" strokeWidth={strokeWidth} />
          {data.map((d, i) => {
            const fraction = d.value / total;
            const dash = fraction * circumference;
            const offset = -cumulative * circumference;
            cumulative += fraction;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
              />
            );
          })}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide">{centerLabel.label}</span>
            <span className="text-lg font-bold text-zinc-100">{centerLabel.value}</span>
          </div>
        )}
      </div>
      <div className="flex-1 w-full space-y-2 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-zinc-300 truncate">{d.label}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="font-bold text-zinc-100">{formatValue(d.value)}</span>
              <span className="text-zinc-500 text-xs w-9 text-right">{((d.value / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Lightweight SVG area/line chart for a revenue-over-time trend - hand
// rolled (no chart library dependency) since the data volumes here are a
// handful of points, not something needing a full charting engine.
export function TrendLineChart({ data, accent = 'emerald', formatValue = (v) => String(v), emptyMessage = EMPTY_MESSAGE }) {
  if (!data || data.length === 0) {
    return <p className="text-zinc-500 text-center py-10 text-sm">{emptyMessage}</p>;
  }
  const width = 640, height = 200;
  const padding = { top: 14, right: 14, bottom: 24, left: 14 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map(d => d.value), 1);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: padding.left + (data.length > 1 ? i * stepX : innerW / 2),
    y: padding.top + innerH - (d.value / max) * innerH,
    ...d
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;
  const color = TREND_COLORS[accent] || TREND_COLORS.emerald;
  const gradientId = `trend-gradient-${accent}`;
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ minWidth: 320, height: 200 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line
            key={f}
            x1={padding.left} x2={width - padding.right}
            y1={padding.top + innerH * (1 - f)} y2={padding.top + innerH * (1 - f)}
            stroke="#27272a" strokeWidth="1"
          />
        ))}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color}>
            <title>{`${p.label}: ${formatValue(p.value)}`}</title>
          </circle>
        ))}
        {points.map((p, i) => (
          i % labelStep === 0 ? (
            <text key={i} x={p.x} y={height - 6} fontSize="9" fill="#71717a" textAnchor="middle">{p.label}</text>
          ) : null
        ))}
      </svg>
    </div>
  );
}
