import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchListing,
  fetchPriceHistory,
  fetchSimilar,
  type Listing,
  type PricePoint,
} from "../api";
import { getCompareIds, toggleCompare } from "../compare";
import DealBadge from "../components/DealBadge";
import ErrorState from "../components/ErrorState";
import ExplanationList from "../components/ExplanationList";
import PriceBar from "../components/PriceBar";
import ShareButtons from "../components/ShareButtons";
import { LineChart } from "../components/charts";
import {
  formatDrive,
  formatFuel,
  formatGearbox,
  formatKm,
  formatPrice,
} from "../components/format";

const SIMILAR_PAGE = 8;

export default function CarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [similarTotal, setSimilarTotal] = useState(0);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCar(null);
    setSimilar([]);
    setSimilarTotal(0);
    setHistory([]);
    fetchListing(Number(id))
      .then((data) => {
        setCar(data);
        return Promise.all([
          fetchSimilar(Number(id), SIMILAR_PAGE, 0),
          fetchPriceHistory(Number(id)),
        ]);
      })
      .then(([similarData, historyData]) => {
        setSimilar(similarData.items);
        setSimilarTotal(similarData.total);
        setHistory(historyData.points);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const loadMoreSimilar = () => {
    fetchSimilar(Number(id), SIMILAR_PAGE, similar.length)
      .then((data) => setSimilar((prev) => [...prev, ...data.items]))
      .catch(console.error);
  };

  if (error) return <ErrorState message={error} />;
  if (!car) return <p className="mt-16 text-center text-slate-400">Loading…</p>;

  return (
    <div className="mt-8">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← Listings
      </Link>

      {/* Title */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{car.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {car.year} · {formatKm(car.mileage_km)} ·{" "}
            {car.power_kw ? `${car.power_kw} kW` : "—"} · {formatFuel(car.fuel)} ·{" "}
            {formatGearbox(car.gearbox)}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {car.seller_type === "dealer"
              ? "Dealer offer"
              : car.seller_type === "private"
                ? "Private seller"
                : "Seller not specified"}
            {car.status === "sold" && " · no longer listed"}
            {car.offer_type === "rent" && " · rental / subscription offer"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CompareButton id={car.id} />
          <DealBadge verdict={car.deal_verdict} />
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {/* Left: details */}
        <div className="space-y-6 lg:col-span-2">
          <Panel title="Vehicle specs">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
              <Spec label="Year" value={String(car.year)} />
              <Spec label="Mileage" value={formatKm(car.mileage_km)} />
              <Spec label="Power" value={car.power_kw ? `${car.power_kw} kW` : "—"} />
              <Spec label="Engine" value={car.engine_cc ? `${car.engine_cc} cm³` : "—"} />
              <Spec label="Fuel" value={formatFuel(car.fuel)} />
              <Spec label="Gearbox" value={formatGearbox(car.gearbox)} />
              <Spec label="Body" value={car.body ?? "—"} />
              <Spec label="Drive" value={formatDrive(car.drive)} />
            </dl>
          </Panel>

          {car.fair_price_eur != null && (
            <Panel title="Price analysis">
              <PriceBar
                fair={car.fair_price_eur}
                low={car.interval_low_eur ?? car.fair_price_eur}
                high={car.interval_high_eur ?? car.fair_price_eur}
                actual={car.price_eur}
              />
              <div className="mt-6">
                <ExplanationList
                  items={car.explanation}
                  baseline={car.baseline_price_eur}
                />
              </div>
            </Panel>
          )}

          <Panel title="Price history">
            {history.length >= 1 ? (
              <>
                <LineChart
                  data={history.map((p) => ({
                    label: p.observed_at.slice(0, 10),
                    value: p.price_eur,
                  }))}
                  valueFormat={(v) => `${Math.round(v / 1000)}k €`}
                />
                <p className="mt-2 text-xs text-slate-400">
                  {history.length === 1
                    ? `First observation ${history[0].observed_at.slice(0, 10)} - the line grows as crawls observe price changes.`
                    : `${history.length} observations since ${history[0].observed_at.slice(0, 10)}` +
                      (history[history.length - 1].price_eur !== history[0].price_eur
                        ? ` · price changed by ${(
                            history[history.length - 1].price_eur - history[0].price_eur
                          ).toLocaleString("en-US")} € since first seen`
                        : " · price unchanged so far")}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No price history yet - the daily crawls record every observed
                price, so a timeline will appear here.
              </p>
            )}
          </Panel>

          <Panel
            title={
              similarTotal > 0
                ? `Similar offers (${similarTotal})`
                : "Similar offers"
            }
          >
            {similar.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-[15px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                        <th className="py-2 pr-4">Car</th>
                        <th className="px-3 py-2 text-right">Price</th>
                        <th className="px-3 py-2 text-right">Fair</th>
                        <th className="px-3 py-2 text-right">Profit</th>
                        <th className="px-3 py-2">Deal</th>
                        <th className="py-2 pl-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {similar.map((other) => {
                        const profit =
                          other.deal_score != null &&
                          other.fair_price_eur != null &&
                          other.price_eur != null
                            ? other.fair_price_eur - other.price_eur
                            : null;
                        return (
                          <tr
                            key={other.id}
                            onClick={() => navigate(`/car/${other.id}`)}
                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                          >
                            <td className="py-2 pr-4">
                              <div className="font-medium text-blue-700">
                                {other.title}
                              </div>
                              <div className="text-xs text-slate-400">
                                {diffText(other, car)}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                              {formatPrice(other.price_eur)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-slate-400">
                              {formatPrice(other.fair_price_eur)}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                                profit != null && profit > 0
                                  ? "text-emerald-600"
                                  : profit != null && profit < 0
                                    ? "text-red-500"
                                    : "text-slate-300"
                              }`}
                            >
                              {profit != null
                                ? `${profit > 0 ? "+" : profit < 0 ? "−" : ""}${Math.abs(Math.round(profit)).toLocaleString("en-US")} €`
                                : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <DealBadge verdict={other.deal_verdict} />
                            </td>
                            <td className="py-2 pl-3 text-right">
                              <a
                                href={other.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="whitespace-nowrap text-sm text-slate-400 hover:text-slate-900"
                              >
                                View listing ↗
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {similar.length < similarTotal && (
                  <button
                    onClick={loadMoreSimilar}
                    className="mt-4 rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:text-slate-900"
                  >
                    Load more ({similarTotal - similar.length} remaining)
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No other offers of this model right now.
              </p>
            )}
          </Panel>
        </div>

        {/* Right: price card */}
        <aside
          className={`border bg-white px-6 py-5 lg:sticky lg:top-4 ${
            car.deal_score != null && car.deal_score > 0.05
              ? "border-emerald-300"
              : car.deal_score != null && car.deal_score < -0.05
                ? "border-red-300"
                : "border-slate-200"
          }`}
        >
          <div className="text-3xl font-bold">{formatPrice(car.price_eur)}</div>
          <div className="text-xs text-slate-400">Asking price</div>

          {car.fair_price_eur != null && (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Fair price</dt>
                <dd className="font-medium">{formatPrice(car.fair_price_eur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Typical range</dt>
                <dd>
                  {formatPrice(car.interval_low_eur)} –{" "}
                  {formatPrice(car.interval_high_eur)}
                </dd>
              </div>
              {car.deal_score != null && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Vs fair price</dt>
                  <dd
                    className={`font-medium ${
                      car.deal_score > 0
                        ? "text-emerald-600"
                        : car.deal_score < 0
                          ? "text-red-500"
                          : ""
                    }`}
                  >
                    {car.deal_score > 0 ? "−" : "+"}
                    {Math.abs(car.deal_score * 100).toFixed(0)}%
                  </dd>
                </div>
              )}
            </dl>
          )}

          <a
            href={car.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 block rounded bg-slate-900 px-5 py-2.5 text-center text-sm font-medium text-white hover:bg-slate-800"
          >
            View listing ↗
          </a>
          <p className="mt-3 text-center text-xs text-slate-400">
            Opens the original offer on the source site
          </p>

          <ShareButtons car={car} />
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white px-6 py-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-[15px]">{value}</dd>
    </div>
  );
}

/** Adds/removes this car from the side-by-side comparison. */
function CompareButton({ id }: { id: number }) {
  const [selected, setSelected] = useState(getCompareIds().includes(id));
  return (
    <button
      onClick={() => setSelected(toggleCompare(id).includes(id))}
      className={`rounded border px-3 py-1.5 text-sm ${
        selected
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-300 text-slate-600 hover:text-slate-900"
      }`}
    >
      {selected ? "✓ In compare" : "+ Add to compare"}
    </button>
  );
}

/** Human-readable difference vs. the car being viewed. */
function diffText(other: Listing, ref: Listing): string {
  const parts: string[] = [];
  if (other.year !== ref.year) {
    const d = other.year - ref.year;
    parts.push(`${d > 0 ? "+" : ""}${d} yr`);
  }
  if (other.mileage_km != null && ref.mileage_km != null) {
    const d = Math.round((other.mileage_km - ref.mileage_km) / 1000);
    if (d !== 0) parts.push(`${d > 0 ? "+" : ""}${d}k km`);
  }
  if (other.power_kw != null && ref.power_kw != null) {
    const d = other.power_kw - ref.power_kw;
    if (d !== 0) parts.push(`${d > 0 ? "+" : ""}${d} kW`);
  }
  return parts.join(" · ") || "same specs";
}
