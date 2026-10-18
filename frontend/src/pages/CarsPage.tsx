import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchListings, fetchStats, type Listing, type Stats } from "../api";
import DealBadge from "../components/DealBadge";
import {
  BODY_OPTIONS,
  DRIVE_OPTIONS,
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
      <section className="mt-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Used car price analysis
        </h1>
        <p className="mt-1 max-w-2xl text-base text-slate-600">
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

      {/* Filters */}
      <section className="mt-6 border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Make">
            <select
              className={inputCls}
              value={draft.make}
              onChange={(e) => set("make", e.target.value)}
            >
              <option value="">All makes</option>
              {stats?.makes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fuel">
            <select className={inputCls} value={draft.fuel} onChange={(e) => set("fuel", e.target.value)}>
              <option value="">Any fuel</option>
              {FUEL_OPTIONS.map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gearbox">
            <select
              className={inputCls}
              value={draft.gearbox}
              onChange={(e) => set("gearbox", e.target.value)}
            >
              <option value="">Any gearbox</option>
              {GEARBOX_OPTIONS.map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Body">
            <select className={inputCls} value={draft.body} onChange={(e) => set("body", e.target.value)}>
              <option value="">Any body</option>
              {BODY_OPTIONS.map(([label, value]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price from (€)">
            <input
              className={inputCls}
              value={draft.price_min}
              onChange={(e) => set("price_min", e.target.value)}
              placeholder="min"
            />
          </Field>
          <Field label="Price to (€)">
            <input
              className={inputCls}
              value={draft.price_max}
              onChange={(e) => set("price_max", e.target.value)}
              placeholder="max"
            />
          </Field>
          <Field label="Year from">
            <input
              className={inputCls}
              value={draft.year_min}
              onChange={(e) => set("year_min", e.target.value)}
              placeholder="e.g. 2018"
            />
          </Field>
          <Field label="Year to">
            <input
              className={inputCls}
              value={draft.year_max}
              onChange={(e) => set("year_max", e.target.value)}
              placeholder="e.g. 2024"
            />
          </Field>
          <Field label="Verdict">
            <select
              className={inputCls}
              value={draft.verdict}
              onChange={(e) => set("verdict", e.target.value)}
            >
              <option value="">Any verdict</option>
              <option value="cheap">Good deals</option>
              <option value="fair">Fair price</option>
              <option value="overpriced">Overpriced</option>
              <option value="suspicious">Check price</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select className={inputCls} value={draft.sort} onChange={(e) => set("sort", e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="deal_best">Best deals first</option>
              <option value="deal_worst">Worst deals first</option>
              <option value="price_low">Price: low to high</option>
              <option value="price_high">Price: high to low</option>
              <option value="year_new">Year: newest first</option>
              <option value="year_old">Year: oldest first</option>
              <option value="mileage_low">Mileage: low to high</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={applyFilters}
            className="rounded bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Apply filters
          </button>
          <button
            onClick={resetFilters}
            className="rounded border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
          <span className="ml-auto text-sm text-slate-500">
            {total.toLocaleString("en-US")} cars match
          </span>
        </div>
      </section>

      {/* Listing table */}
      <section className="mt-5 overflow-x-auto border border-slate-200 bg-white">
        <table className="w-full min-w-[860px] text-base">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-sm text-slate-600">
              <th className="px-4 py-3 font-semibold">Car</th>
              <th className="px-3 py-3 text-right font-semibold">Year</th>
              <th className="px-3 py-3 text-right font-semibold">Mileage</th>
              <th className="px-3 py-3 font-semibold">Fuel</th>
              <th className="px-3 py-3 text-right font-semibold">Power</th>
              <th className="px-3 py-3 text-right font-semibold">Price</th>
              <th className="px-3 py-3 text-right font-semibold">Fair price</th>
              <th className="px-3 py-3 font-semibold">Verdict</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
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
      <section className="mt-5 flex items-center justify-center gap-5 text-base">
        <button
          onClick={() => gotoPage(Math.max(0, applied.page - 1))}
          disabled={applied.page === 0}
          className="text-blue-700 disabled:text-slate-300"
        >
          ← Previous
        </button>
        <span className="text-slate-500">
          Page {applied.page + 1} of {pages}
        </span>
        <button
          onClick={() => gotoPage(Math.min(pages - 1, applied.page + 1))}
          disabled={applied.page + 1 >= pages}
          className="text-blue-700 disabled:text-slate-300"
        >
          Next →
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

// Shared input styles for the filter form.
const inputCls =
  "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-base focus:border-blue-600 focus:outline-none";

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
    <div className="bg-white px-5 py-4">
      <div className={`text-2xl font-semibold ${accent ?? "text-slate-900"}`}>
        {value.toLocaleString("en-US")}
      </div>
      <div className="text-sm text-slate-500">{label}</div>
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
      <td className="px-4 py-3">
        <span className="font-medium text-blue-700">{car.title}</span>
      </td>
      <td className="px-3 py-3 text-right text-slate-700">{car.year}</td>
      <td className="px-3 py-3 text-right text-slate-700">
        {formatKm(car.mileage_km)}
      </td>
      <td className="px-3 py-3 text-slate-700">{car.fuel ?? "—"}</td>
      <td className="px-3 py-3 text-right text-slate-700">
        {car.power_kw ? `${car.power_kw} kW` : "—"}
      </td>
      <td className="px-3 py-3 text-right text-lg font-semibold text-slate-900">
        {formatPrice(car.price_eur)}
      </td>
      <td className="px-3 py-3 text-right text-slate-500">
        {formatPrice(car.fair_price_eur)}
      </td>
      <td className="px-3 py-3">
        <DealBadge verdict={car.deal_verdict} />
      </td>
      <td className="px-4 py-3 text-right">
        <a
          href={car.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="whitespace-nowrap text-sm text-blue-700 hover:underline"
        >
          View listing ↗
        </a>
      </td>
    </tr>
  );
}
