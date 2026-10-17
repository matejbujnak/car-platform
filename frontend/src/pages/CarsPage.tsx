import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListings, fetchStats, type Listing, type Stats } from "../api";
import DealBadge from "../components/DealBadge";
import { formatKm, formatPrice } from "../components/format";

const PAGE_SIZE = 25;

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
      <section className="mt-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Used car price analysis
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          A machine-learning model estimates the fair market price of every
          listed car and flags the ones that are cheaper than they should be.
        </p>

        {stats && (
          <div className="mt-4 grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4">
            <Stat label="Cars analyzed" value={stats.listings_total} />
            <Stat label="Good deals" value={stats.by_verdict.cheap} accent="text-green-700" />
            <Stat label="Fair price" value={stats.by_verdict.fair} />
            <Stat label="Overpriced" value={stats.by_verdict.overpriced} accent="text-red-700" />
          </div>
        )}
      </section>

      {/* Toolbar */}
      <section className="mt-6 flex flex-wrap items-center gap-2">
        <select
          value={make}
          onChange={(e) => {
            setMake(e.target.value);
            setPage(0);
          }}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
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
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="deal_score">Best deals first</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">
          {total.toLocaleString("en-US")} cars
        </span>
      </section>

      {/* Listing rows */}
      {loading ? (
        <p className="mt-12 text-center text-sm text-slate-500">Loading…</p>
      ) : (
        <section className="mt-3 divide-y divide-slate-100 border border-slate-200 bg-white">
          {items.map((car) => (
            <Row key={car.id} car={car} />
          ))}
        </section>
      )}

      {/* Pagination */}
      <section className="mt-4 flex items-center justify-center gap-4 text-sm">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="text-blue-700 disabled:text-slate-300"
        >
          ← Previous
        </button>
        <span className="text-slate-500">
          Page {page + 1} of {pages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
          disabled={page + 1 >= pages}
          className="text-blue-700 disabled:text-slate-300"
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
    <div className="bg-white px-4 py-3">
      <div className={`text-lg font-semibold ${accent ?? "text-slate-900"}`}>
        {value.toLocaleString("en-US")}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Row({ car }: { car: Listing }) {
  const score = car.deal_score;
  return (
    <Link
      to={`/car/${car.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-medium text-blue-700">
            {car.title}
          </h3>
          <DealBadge verdict={car.deal_verdict} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {car.year} · {formatKm(car.mileage_km)} · {car.fuel ?? "—"} ·{" "}
          {car.power_kw ? `${car.power_kw} kW` : "—"} · {car.gearbox ?? "—"}
        </p>
      </div>
      <div className="w-24 text-right text-xs text-slate-500">
        {score != null ? (
          <span
            className={
              score > 0.05
                ? "font-medium text-green-700"
                : score < -0.05
                  ? "font-medium text-red-700"
                  : ""
            }
          >
            {score > 0 ? "−" : "+"}
            {Math.abs(score * 100).toFixed(0)}% vs fair
          </span>
        ) : (
          ""
        )}
      </div>
      <div className="w-32 text-right">
        <div className="text-sm font-semibold text-slate-900">
          {formatPrice(car.price_eur)}
        </div>
        {car.fair_price_eur != null && (
          <div className="text-xs text-slate-400">
            fair {formatPrice(car.fair_price_eur)}
          </div>
        )}
      </div>
    </Link>
  );
}
