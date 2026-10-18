import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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

      {/* Listing table */}
      <section className="mt-3 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-2 font-medium">Car</th>
              <th className="px-3 py-2 text-right font-medium">Year</th>
              <th className="px-3 py-2 text-right font-medium">Mileage</th>
              <th className="px-3 py-2 font-medium">Fuel</th>
              <th className="px-3 py-2 text-right font-medium">Power</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Fair price</th>
              <th className="px-3 py-2 font-medium">Verdict</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (
              items.map((car) => <Row key={car.id} car={car} />)
            )}
          </tbody>
        </table>
      </section>

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
  const navigate = useNavigate();
  return (
    <tr
      onClick={() => navigate(`/car/${car.id}`)}
      className="cursor-pointer hover:bg-slate-50"
    >
      <td className="px-4 py-2 text-blue-700">{car.title}</td>
      <td className="px-3 py-2 text-right text-slate-700">{car.year}</td>
      <td className="px-3 py-2 text-right text-slate-700">
        {formatKm(car.mileage_km)}
      </td>
      <td className="px-3 py-2 text-slate-700">{car.fuel ?? "—"}</td>
      <td className="px-3 py-2 text-right text-slate-700">
        {car.power_kw ? `${car.power_kw} kW` : "—"}
      </td>
      <td className="px-3 py-2 text-right font-semibold text-slate-900">
        {formatPrice(car.price_eur)}
      </td>
      <td className="px-3 py-2 text-right text-slate-500">
        {formatPrice(car.fair_price_eur)}
      </td>
      <td className="px-3 py-2">
        <DealBadge verdict={car.deal_verdict} />
      </td>
      <td className="px-3 py-2 text-right">
        <a
          href={car.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open original listing"
          onClick={(e) => e.stopPropagation()}
          className="text-slate-400 hover:text-blue-700"
        >
          ↗
        </a>
      </td>
    </tr>
  );
}
