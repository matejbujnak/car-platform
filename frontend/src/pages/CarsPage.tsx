import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchListings, fetchStats, type Listing, type Stats } from "../api";
import DealBadge from "../components/DealBadge";
import {
  BODY_OPTIONS,
  FUEL_OPTIONS,
  GEARBOX_OPTIONS,
  formatKm,
  formatPrice,
} from "../components/format";

const PAGE_SIZE = 25;
const STORAGE_KEY = "carFilters";

interface Filters {
  make: string;
  fuel: string;
  gearbox: string;
  body: string;
  drive: string;
  price_min: string;
  price_max: string;
  year_min: string;
  year_max: string;
  mileage_max: string;
  verdict: string;
  sort: string;
  page: number;
}

const EMPTY: Filters = {
  make: "",
  fuel: "",
  gearbox: "",
  body: "",
  drive: "",
  price_min: "",
  price_max: "",
  year_min: "",
  year_max: "",
  mileage_max: "",
  verdict: "",
  sort: "newest",
  page: 0,
};

function loadInitialFilters(search: string): Filters {
  const params = Object.fromEntries(new URLSearchParams(search).entries());
  if (Object.keys(params).length > 0) {
    return { ...EMPTY, ...params, page: Number(params.page ?? 0) };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...EMPTY, ...JSON.parse(saved) };
  } catch {
    /* ignore broken saved state */
  }
  return EMPTY;
}

const inputCls =
  "rounded border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none";

export default function CarsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = useMemo(() => loadInitialFilters(window.location.search), []);
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchListings({
      limit: PAGE_SIZE,
      offset: applied.page * PAGE_SIZE,
      make: applied.make,
      fuel: applied.fuel,
      gearbox: applied.gearbox,
      body: applied.body,
      drive: applied.drive,
      price_min: applied.price_min,
      price_max: applied.price_max,
      year_min: applied.year_min,
      year_max: applied.year_max,
      mileage_max: applied.mileage_max,
      verdict: applied.verdict,
      sort: applied.sort,
    })
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [applied]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function persist(filters: Filters) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== "" && v !== 0),
    );
    setSearchParams(params);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }

  function applyFilters() {
    const next = { ...draft, page: 0 };
    setApplied(next);
    persist(next);
  }

  function resetFilters() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setSearchParams({});
    localStorage.removeItem(STORAGE_KEY);
  }

  function gotoPage(page: number) {
    const next = { ...applied, page };
    setApplied(next);
    persist(next);
    window.scrollTo({ top: 0 });
  }

  const set = (key: keyof Filters, value: string) =>
    setDraft((f) => ({ ...f, [key]: value }));

  return (
    <div>
      {/* Heading */}
      <div className="mt-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">
          Listings{" "}
          <span className="text-lg font-normal text-slate-400">
            {total.toLocaleString("en-US")} cars
          </span>
        </h1>
        {stats?.model_name && (
          <span className="text-sm text-slate-400">Model: {stats.model_name}</span>
        )}
      </div>

      {/* Filter bar */}
      <section className="mt-4 flex flex-wrap items-center gap-2">
        <select
          className={inputCls}
          value={draft.make}
          onChange={(e) => set("make", e.target.value)}
        >
          <option value="">Make</option>
          {stats?.makes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={draft.fuel}
          onChange={(e) => set("fuel", e.target.value)}
        >
          <option value="">Fuel</option>
          {FUEL_OPTIONS.map(([label, value]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={draft.gearbox}
          onChange={(e) => set("gearbox", e.target.value)}
        >
          <option value="">Gearbox</option>
          {GEARBOX_OPTIONS.map(([label, value]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={draft.body}
          onChange={(e) => set("body", e.target.value)}
        >
          <option value="">Body</option>
          {BODY_OPTIONS.map(([label, value]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className={`${inputCls} w-28`}
          value={draft.year_min}
          onChange={(e) => set("year_min", e.target.value)}
          placeholder="Year from"
        />
        <input
          className={`${inputCls} w-28`}
          value={draft.year_max}
          onChange={(e) => set("year_max", e.target.value)}
          placeholder="Year to"
        />
        <input
          className={`${inputCls} w-28`}
          value={draft.mileage_max}
          onChange={(e) => set("mileage_max", e.target.value)}
          placeholder="Max km"
        />
        <input
          className={`${inputCls} w-28`}
          value={draft.price_min}
          onChange={(e) => set("price_min", e.target.value)}
          placeholder="Min €"
        />
        <input
          className={`${inputCls} w-28`}
          value={draft.price_max}
          onChange={(e) => set("price_max", e.target.value)}
          placeholder="Max €"
        />
        <select
          className={inputCls}
          value={draft.verdict}
          onChange={(e) => set("verdict", e.target.value)}
        >
          <option value="">Verdict</option>
          <option value="cheap">Good deals</option>
          <option value="fair">Fair price</option>
          <option value="overpriced">Overpriced</option>
          <option value="suspicious">Check price</option>
        </select>
        <select
          className={inputCls}
          value={draft.sort}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="newest">Sort: newest</option>
          <option value="deal_best">Sort: best deals</option>
          <option value="deal_worst">Sort: worst deals</option>
          <option value="price_low">Sort: price ↑</option>
          <option value="price_high">Sort: price ↓</option>
          <option value="year_new">Sort: year ↓</option>
          <option value="year_old">Sort: year ↑</option>
          <option value="mileage_low">Sort: km ↑</option>
        </select>
        <button
          onClick={applyFilters}
          className="rounded bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Filter
        </button>
        <button
          onClick={resetFilters}
          className="px-2 py-2 text-sm text-slate-500 hover:text-slate-900"
        >
          Reset
        </button>
      </section>

      {/* Table */}
      <section className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-[15px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-4">Car</th>
              <th className="px-3 py-2.5 text-right">Year</th>
              <th className="px-3 py-2.5 text-right">KM</th>
              <th className="px-3 py-2.5">Fuel</th>
              <th className="px-3 py-2.5 text-right">KW</th>
              <th className="px-3 py-2.5">Gearbox</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5 text-right">Fair</th>
              <th className="px-3 py-2.5">Deal</th>
              <th className="py-2.5 pl-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="py-16 text-center text-slate-400">
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
      <section className="mt-6 mb-4 flex items-center justify-center gap-5 text-sm">
        <button
          onClick={() => gotoPage(Math.max(0, applied.page - 1))}
          disabled={applied.page === 0}
          className="text-slate-600 hover:text-slate-900 disabled:text-slate-300"
        >
          ← Previous
        </button>
        <span className="text-slate-400">
          Page {applied.page + 1} of {pages}
        </span>
        <button
          onClick={() => gotoPage(Math.min(pages - 1, applied.page + 1))}
          disabled={applied.page + 1 >= pages}
          className="text-slate-600 hover:text-slate-900 disabled:text-slate-300"
        >
          Next →
        </button>
      </section>
    </div>
  );
}

function Row({ car }: { car: Listing }) {
  const navigate = useNavigate();
  return (
    <tr
      onClick={() => navigate(`/car/${car.id}`)}
      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
    >
      <td className="py-3 pr-4 font-medium">{car.title}</td>
      <td className="px-3 py-3 text-right text-slate-600">{car.year}</td>
      <td className="px-3 py-3 text-right text-slate-600">
        {formatKm(car.mileage_km)}
      </td>
      <td className="px-3 py-3 text-slate-600">{car.fuel ?? "—"}</td>
      <td className="px-3 py-3 text-right text-slate-600">
        {car.power_kw ?? "—"}
      </td>
      <td className="px-3 py-3 text-slate-600">{car.gearbox ?? "—"}</td>
      <td className="px-3 py-3 text-right font-semibold">
        {formatPrice(car.price_eur)}
      </td>
      <td className="px-3 py-3 text-right text-slate-400">
        {formatPrice(car.fair_price_eur)}
      </td>
      <td className="px-3 py-3">
        <DealBadge verdict={car.deal_verdict} />
      </td>
      <td className="py-3 pl-3 text-right">
        <a
          href={car.url}
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
}
