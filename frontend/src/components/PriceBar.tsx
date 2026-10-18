import { formatPrice } from "./format";

interface Props {
  fair: number;
  low: number;
  high: number;
  actual?: number | null;
}

/** Visualizes the fair price, its prediction interval and the asking price. */
export default function PriceBar({ fair, low, high, actual }: Props) {
  const max = Math.max(high, actual ?? 0, fair) * 1.1 || 1;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <div>
      <div className="relative h-1.5 bg-slate-100">
        <div
          className="absolute h-1.5 bg-emerald-200"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        <div
          className="absolute -top-1 h-3.5 w-px bg-slate-900"
          style={{ left: pct(fair) }}
          title={`Fair price ${formatPrice(fair)}`}
        />
        {actual != null && (
          <div
            className="absolute -top-1 h-3.5 w-px bg-red-500"
            style={{ left: pct(actual) }}
            title={`Asking price ${formatPrice(actual)}`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
        <span>
          fair price <b className="font-medium text-slate-600">{formatPrice(fair)}</b>
        </span>
        <span>
          typical range{" "}
          <b className="font-medium text-slate-600">
            {formatPrice(low)} – {formatPrice(high)}
          </b>
        </span>
        {actual != null && (
          <span>
            asking price{" "}
            <b className="font-medium text-slate-600">{formatPrice(actual)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
