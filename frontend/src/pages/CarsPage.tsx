import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchListings,
  fetchStats,
  type Listing,
  type Stats,
} from "../api";
import { DealBadge } from "../components/Header";
import { formatKm, formatPrice } from "../components/format";

const PAGE_SIZE = 24;

export default function CarsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [make, setMake] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchListings({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      make: make || undefined,
      sort,
    })
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [make, sort, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Hero */}
      <section className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">
          Find out which used cars are <span className="text-emerald-600">underpriced</span>
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          A machine-learning model estimates the fair price of every car on the
          market and flags the ones that are cheaper than they should be.
        </p>
        {stats && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Stat label="Cars analyzed" value={stats.listings_total} />
            <Stat label="Good deals" value={stats.by_verdict.cheap} accent="text-emerald-600" />
            <Stat label="Fair price" value={stats.by_verdict.fair} />
            <Stat label="Overpriced" value={stats.by_verdict.overpriced} accent="text-rose-600" />
          </div>
        )}
      </section>

      {/* Filters */}
      <section className="mt-8 flex flex-wrap items-center gap-3">
        <select
          value={make}
          onChange={(e) => {
            setMake(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">All makes</option>
          {stats?.makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="deal_score">Best deals first</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
        </select>
        <span className="ml-auto text-sm text-slate-400">
          {total.toLocaleString("en-US")} cars
        </span>
      </section>

      {/* Cards */}
      {loading ? (
        <p className="mt-16 text-center text-slate-400">Loading…</p>
      ) : (
        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((car) => (
            <CarCard key={car.id} car={car} />
          ))}
        </section>
      )}

      {/* Pagination */}
      <section className="mt-8 flex items-center justify-center gap-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
        >
          ← Previous
        </button>
        <span className="text-sm text-slate-500">
          Page {page + 1} of {pages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          disabled={page + 1 >= pages}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
        >
          Next →
        </button>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-5 py-3">
      <div className={`text-2xl font-semibold ${accent ?? "text-slate-900"}`}>
        {value.toLocaleString("en-US")}
      </div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function CarCard({ car }: { car: Listing }) {
  const score = car.deal_score;
  return (
    <Link
      to={`/car/${car.id}`}
      className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug text-slate-900">{car.title}</h3>
        <DealBadge verdict={car.deal_verdict} />
      </div>
      <p className="mt-1 text-sm text-slate-400">
        {car.year} · {formatKm(car.mileage_km)} · {car.fuel ?? "—"} ·{" "}
        {car.power_kw ? `${car.power_kw} kW` : "—"}
      </p>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-xl font-bold text-slate-900">
            {formatPrice(car.price_eur)}
          </div>
          {car.fair_price_eur != null && (
            <div className="text-xs text-slate-400">
              fair price {formatPrice(car.fair_price_eur)}
            </div>
          )}
        </div>
        {score != null && (
          <div
            className={`text-sm font-semibold ${
              score > 0.05
                ? "text-emerald-600"
                : score < -0.05
                  ? "text-rose-600"
                  : "text-slate-400"
            }`}
          >
            {score > 0 ? "−" : "+"}
            {Math.abs(score * 100).toFixed(0)}% vs fair
          </div>
        )}
      </div>
    </Link>
  );
}
