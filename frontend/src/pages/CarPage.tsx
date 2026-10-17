import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchListing, type Listing } from "../api";
import { DealBadge } from "../components/Header";
import PriceBar from "../components/PriceBar";
import { formatKm, formatPrice } from "../components/format";

export default function CarPage() {
  const { id } = useParams();
  const [car, setCar] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchListing(Number(id))
      .then(setCar)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="mt-16 text-center text-rose-500">{error}</p>;
  if (!car) return <p className="mt-16 text-center text-slate-400">Loading…</p>;

  return (
    <div className="mt-8">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to cars
      </Link>

      <div className="mt-4 rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{car.title}</h1>
            <p className="mt-1 text-slate-400">
              {car.make} {car.model} · {car.body ?? "—"} ·{" "}
              {car.seller_type === "dealer" ? "Dealer" : "Private seller"}
            </p>
          </div>
          <DealBadge verdict={car.deal_verdict} />
        </div>

        {/* Specs */}
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Spec label="Year" value={String(car.year)} />
          <Spec label="Mileage" value={formatKm(car.mileage_km)} />
          <Spec label="Power" value={car.power_kw ? `${car.power_kw} kW` : "—"} />
          <Spec label="Engine" value={car.engine_cc ? `${car.engine_cc} cm³` : "—"} />
          <Spec label="Fuel" value={car.fuel ?? "—"} />
          <Spec label="Gearbox" value={car.gearbox ?? "—"} />
          <Spec label="Drive" value={car.drive ?? "—"} />
          <Spec label="Asking price" value={formatPrice(car.price_eur)} />
        </dl>

        {/* Price analysis */}
        {car.fair_price_eur != null && (
          <div className="mt-8 rounded-xl bg-slate-50 p-6">
            <h2 className="font-semibold text-slate-900">Price analysis</h2>
            <p className="mt-1 text-sm text-slate-500">
              Estimated by a machine-learning model trained on{" "}
              {car.deal_score != null && (
                <b>
                  {car.deal_score > 0
                    ? `this car is ${Math.abs(car.deal_score * 100).toFixed(0)}% cheaper than fair`
                    : car.deal_score < 0
                      ? `this car is ${Math.abs(car.deal_score * 100).toFixed(0)}% more expensive than fair`
                      : "this car is priced about right"}
                </b>
              )}
            </p>
            <div className="mt-4">
              <PriceBar
                fair={car.fair_price_eur}
                low={car.interval_low_eur ?? car.fair_price_eur}
                high={car.interval_high_eur ?? car.fair_price_eur}
                actual={car.price_eur}
              />
            </div>
          </div>
        )}

        <a
          href={car.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          View original listing ↗
        </a>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
