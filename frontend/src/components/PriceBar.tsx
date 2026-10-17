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
      <div className="relative h-2 rounded-sm bg-slate-100">
        <div
          className="absolute h-2 rounded-sm bg-green-200"
          style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5 bg-blue-700"
          style={{ left: pct(fair) }}
          title={`Fair price ${formatPrice(fair)}`}
        />
        {actual != null && (
          <div
            className="absolute -top-1 h-4 w-0.5 bg-red-600"
            style={{ left: pct(actual) }}
            title={`Asking price ${formatPrice(actual)}`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-blue-700" /> Fair price{" "}
          <b className="font-medium text-slate-700">{formatPrice(fair)}</b>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-green-200" /> Typical range{" "}
          <b className="font-medium text-slate-700">
            {formatPrice(low)} – {formatPrice(high)}
          </b>
        </span>
        {actual != null && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-red-600" /> Asking price{" "}
            <b className="font-medium text-slate-700">{formatPrice(actual)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
