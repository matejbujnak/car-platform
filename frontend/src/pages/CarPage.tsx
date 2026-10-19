import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchListing,
  fetchSimilar,
  type Explanation,
  type Listing,
} from "../api";
import DealBadge from "../components/DealBadge";
import ExplanationList from "../components/ExplanationList";
import PriceBar from "../components/PriceBar";
import { formatKm, formatPrice } from "../components/format";

export default function CarPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [car, setCar] = useState<Listing | null>(null);
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCar(null);
    setSimilar([]);
    fetchListing(Number(id))
      .then((data) => {
        setCar(data);
        return fetchSimilar(Number(id));
      })
      .then((data) => setSimilar(data.items))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="mt-16 text-center text-red-500">{error}</p>;
  if (!car)
    return <p className="mt-16 text-center text-slate-400">Loading…</p>;

  return (
    <div className="mt-8">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← Listings
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold">{car.title}</h1>
        <DealBadge verdict={car.deal_verdict} />
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {car.seller_type === "dealer"
          ? "Dealer offer"
          : car.seller_type === "private"
            ? "Private seller"
            : "Seller not specified"}
      </p>

      {/* Specs */}
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-slate-100 py-5 sm:grid-cols-4">
        <Spec label="Year" value={String(car.year)} />
        <Spec label="KM" value={formatKm(car.mileage_km)} />
        <Spec label="KW" value={car.power_kw ? String(car.power_kw) : "—"} />
        <Spec label="Engine" value={car.engine_cc ? `${car.engine_cc} cm³` : "—"} />
        <Spec label="Fuel" value={car.fuel ?? "—"} />
        <Spec label="Gearbox" value={car.gearbox ?? "—"} />
        <Spec label="Body" value={car.body ?? "—"} />
        <Spec label="Drive" value={car.drive ?? "—"} />
      </dl>

      {/* Price analysis */}
      {car.fair_price_eur != null && (
        <section className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Price analysis
          </h2>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <div className="text-3xl font-bold">
                {formatPrice(car.price_eur)}
              </div>
              <div className="text-xs text-slate-400">Asking price</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-500">
                {formatPrice(car.fair_price_eur)}
              </div>
              <div className="text-xs text-slate-400">Fair price</div>
            </div>
            {car.deal_score != null && (
              <div>
                <div
                  className={`text-3xl font-bold ${
                    car.deal_score > 0
                      ? "text-emerald-600"
                      : car.deal_score < 0
                        ? "text-red-500"
                        : "text-slate-500"
                  }`}
                >
                  {car.deal_score > 0 ? "−" : "+"}
                  {Math.abs(car.deal_score * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-slate-400">vs fair price</div>
              </div>
            )}
          </div>
          <div className="mt-6 max-w-3xl">
            <PriceBar
              fair={car.fair_price_eur}
              low={car.interval_low_eur ?? car.fair_price_eur}
              high={car.interval_high_eur ?? car.fair_price_eur}
              actual={car.price_eur}
            />
          </div>
          <div className="mt-8">
            <ExplanationList
              items={car.explanation}
              baseline={car.baseline_price_eur}
            />
          </div>
        </section>
      )}

      {/* Similar offers */}
      {similar.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Similar offers ({similar.length})
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[15px]">
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
        </section>
      )}

      <a
        href={car.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-block rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
      >
        View listing ↗
      </a>
    </div>
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
