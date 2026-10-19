/** Minimal dependency-free SVG charts in the classic light style. */

export interface ChartPoint {
  label: string;
  value: number;
  avg_price?: number;
}

const AXIS = "#94a3b8";
const BAR = "#334155";

/** Vertical bars with value labels - e.g. price distribution. */
export function VBars({
  data,
  valueFormat = (v: number) => v.toLocaleString("en-US"),
}: {
  data: ChartPoint[];
  valueFormat?: (v: number) => string;
}) {
  const width = 560;
  const height = 220;
  const pad = { top: 16, right: 8, bottom: 34, left: 8 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / Math.max(data.length, 1);
  const barW = Math.min(slot * 0.62, 56);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <line x1={pad.left} y1={pad.top + innerH} x2={width - pad.right} y2={pad.top + innerH} stroke={AXIS} strokeWidth="1" />
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const x = pad.left + i * slot + (slot - barW) / 2;
        return (
          <g key={d.label}>
            <rect x={x} y={pad.top + innerH - h} width={barW} height={h} fill={BAR} />
            <text x={x + barW / 2} y={pad.top + innerH + 16} textAnchor="middle" fontSize="11" fill={AXIS}>
              {d.label}
            </text>
            <text x={x + barW / 2} y={pad.top + innerH - h - 5} textAnchor="middle" fontSize="10" fill={AXIS}>
              {valueFormat(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bars - e.g. top makes by number of offers. */
export function HBars({
  data,
  color,
  valueFormat = (v: number) => v.toLocaleString("en-US"),
}: {
  data: ChartPoint[];
  color?: (label: string) => string;
  valueFormat?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600">{d.label}</span>
          <div className="h-4 flex-1 bg-slate-100">
            <div
              className="h-4"
              style={{
                width: `${Math.max((d.value / max) * 100, 1)}%`,
                background: color ? color(d.label) : BAR,
              }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-slate-500">{valueFormat(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Line chart with dots - e.g. average price per year (depreciation). */
export function LineChart({
  data,
  valueFormat = (v: number) => v.toLocaleString("en-US"),
}: {
  data: ChartPoint[];
  valueFormat?: (v: number) => string;
}) {
  const width = 560;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 30, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) =>
    pad.left + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const y = (v: number) =>
    pad.top + innerH - ((v - min) / (max - min || 1)) * innerH;

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
      <line x1={pad.left} y1={pad.top + innerH} x2={width - pad.right} y2={pad.top + innerH} stroke={AXIS} />
      <text x={pad.left - 6} y={pad.top + 8} textAnchor="end" fontSize="10" fill={AXIS}>
        {valueFormat(max)}
      </text>
      <text x={pad.left - 6} y={pad.top + innerH} textAnchor="end" fontSize="10" fill={AXIS}>
        {valueFormat(min)}
      </text>
      <polyline points={points} fill="none" stroke={BAR} strokeWidth="2" />
      {data.map((d, i) => (
        <g key={d.label}>
          <circle cx={x(i)} cy={y(d.value)} r="3" fill={BAR} />
          <text x={x(i)} y={pad.top + innerH + 16} textAnchor="middle" fontSize="10" fill={AXIS}>
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
