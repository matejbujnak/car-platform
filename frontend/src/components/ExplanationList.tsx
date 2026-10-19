import type { Explanation } from "../api";
import { formatPrice } from "./format";

interface Props {
  items?: Explanation[];
  /** Price of a comparable average car - the starting point of the breakdown. */
  baseline?: number;
}

/**
 * How the fair price is built up: baseline car plus per-feature impacts.
 * The rows add up exactly to the fair price.
 */
export default function ExplanationList({ items, baseline }: Props) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">
        What drives the price
      </h3>
      <ul className="mt-2 max-w-md">
        {baseline != null && (
          <li className="flex items-baseline justify-between border-b border-slate-100 py-1.5 text-sm text-slate-400">
            <span>Average comparable car</span>
            <span>{formatPrice(baseline)}</span>
          </li>
        )}
        {items.map((item) => (
          <li
            key={item.feature}
            className="flex items-baseline justify-between border-b border-slate-100 py-1.5 text-sm"
          >
            <span>
              {item.feature}{" "}
              <span className="text-slate-400">{item.value}</span>
            </span>
            <span
              className={`font-medium ${
                item.impact_eur > 0
                  ? "text-emerald-600"
                  : item.impact_eur < 0
                    ? "text-red-500"
                    : "text-slate-400"
              }`}
            >
              {item.impact_eur > 0 ? "+" : item.impact_eur < 0 ? "−" : ""}
              {Math.abs(item.impact_eur).toLocaleString("en-US")} €
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
