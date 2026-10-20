import { useState } from "react";
import type { Listing } from "../api";
import { formatPrice } from "./format";

/** Share actions for a car: copy link/summary and save the preview image. */
export default function ShareButtons({ car }: { car: Listing }) {
  const [copied, setCopied] = useState("");
  const link = `${window.location.origin}/car/${car.id}`;
  const summary =
    `${car.title} - ${formatPrice(car.price_eur)}` +
    (car.fair_price_eur ? ` (fair ${formatPrice(car.fair_price_eur)})` : "") +
    " - Car Market Analyzer";

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const nativeShare = "share" in navigator;

  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Share
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => copy(link, "link")}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          {copied === "link" ? "✓ Link copied" : "Copy link"}
        </button>
        <button
          onClick={() => copy(summary, "summary")}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          {copied === "summary" ? "✓ Summary copied" : "Copy summary"}
        </button>
        <a
          href={`/api/listings/${car.id}/share.png`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          Preview image ↓
        </a>
        {nativeShare && (
          <button
            onClick={() =>
              navigator
                .share({ title: car.title, text: summary, url: link })
                .catch(() => {})
            }
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            Share…
          </button>
        )}
      </div>
    </div>
  );
}
