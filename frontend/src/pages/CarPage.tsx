import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchListing, type Listing } from "../api";
import DealBadge from "../components/DealBadge";
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

  if (error) return <p className="mt-12 text-center text-sm text-red-600">{error}</p>;
  if (!car) return <p className="mt-12 text-center text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mt-6">
      <Link to="/" className="text-sm text-blue-700 hover:underline">
        ← Back to cars
      </Link>

      <div className="mt-3 border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{car.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {car.seller_type === "dealer"
                ? "Dealer offer"
                : car.seller_type === "private"
                  ? "Private seller"
                  : "Seller not specified"}
            </p>
          </div>
          <DealBadge verdict={car.deal_verdict} />
        </div>

        {/* Specs */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 sm:grid-cols-4">
          <Spec label="Year" value={String(car.year)} />
          <Spec label="Mileage" value={formatKm(car.mileage_km)} />
          <Spec label="Power" value={car.power_kw ? `${car.power_kw} kW` : "—"} />
          <Spec label="Engine" value={car.engine_cc ? `${car.engine_cc} cm³` : "—"} />
          <Spec label="Fuel" value={car.fuel ?? "—"} />
          <Spec label="Gearbox" value={car.gearbox ?? "—"} />
          <Spec label="Body" value={car.body ?? "—"} />
          <Spec label="Drive" value={car.drive ?? "—"} />
        </dl>

        {/* Price analysis */}
        {car.fair_price_eur != null && (
          <div className="border-t border-slate-100 px-6 py-5">
            <h2 className="text-sm font-semibold text-slate-900">Price analysis</h2>
            {car.deal_score != null && (
              <p className="mt-1 text-sm text-slate-600">
                {car.deal_score > 0
                  ? `This car is about ${Math.abs(car.deal_score * 100).toFixed(0)}% cheaper than the estimated fair price.`
                  : car.deal_score < 0
                    ? `This car is about ${Math.abs(car.deal_score * 100).toFixed(0)}% more expensive than the estimated fair price.`
                    : "This car is priced about at the fair price."}
              </p>
            )}
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

        <div className="border-t border-slate-100 px-6 py-4">
          <a
            href={car.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            View original listing ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
