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
