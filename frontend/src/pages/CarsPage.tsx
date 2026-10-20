import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  askParse,
  fetchListings,
  fetchModelNames,
  fetchStats,
  type Listing,
  type Stats,
} from "../api";
import DealBadge from "../components/DealBadge";
import MultiSelect from "../components/MultiSelect";
import {
  BODY_OPTIONS,
  DRIVE_FILTER_OPTIONS,
  FUEL_OPTIONS,
  GEARBOX_OPTIONS,
  formatDrive,
  formatFuel,
  formatGearbox,
  formatKm,
  formatPrice,
} from "../components/format";

const PAGE_SIZE = 25;
const STORAGE_KEY = "carFilters";

interface Filters {
  make: string;
  model: string;
  search: string;
  fuel: string;
  gearbox: string;
  body: string;
  drive: string;
  price_min: string;
  price_max: string;
  power_min: string;
  power_max: string;
  year_min: string;
  year_max: string;
  mileage_max: string;
  status: string;
  offer: string;
  verdict: string;
  sort: string;
  page: number;
}

const EMPTY: Filters = {
  make: "",
  model: "",
  search: "",
  fuel: "",
  gearbox: "",
  body: "",
  drive: "",
  price_min: "",
  price_max: "",
  power_min: "",
  power_max: "",
  year_min: "",
  year_max: "",
  mileage_max: "",
  status: "active",
  offer: "sale",
  verdict: "",
  sort: "newest",
  page: 0,
};

// Column sorting: 1st click -> one direction, 2nd click -> reverse,
// 3rd click -> sorting off (back to newest first).
type SortKey = "year" | "km" | "power" | "fuel" | "price" | "fair" | "profit" | "deal";

const SORT_CYCLE: Record<SortKey, [string, string]> = {
  year: ["year_new", "year_old"],
  km: ["mileage_low", "mileage_high"],
  power: ["power_high", "power_low"],
  fuel: ["fuel_az", "fuel_za"],
  price: ["price_low", "price_high"],
  fair: ["fair_low", "fair_high"],
  profit: ["profit_best", "profit_worst"],
  deal: ["deal_best", "deal_worst"],
};

const SORT_ARROW: Record<string, string> = {
  year_new: "↓",
  year_old: "↑",
  mileage_low: "↑",
  mileage_high: "↓",
  power_high: "↓",
  power_low: "↑",
  fuel_az: "↓",
  fuel_za: "↑",
  price_low: "↑",
  price_high: "↓",
  fair_low: "↑",
  fair_high: "↓",
  profit_best: "↓",
  profit_worst: "↑",
  deal_best: "↓",
  deal_worst: "↑",
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
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [items, setItems] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [smartQuery, setSmartQuery] = useState("");
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartNote, setSmartNote] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

  // Model choices follow the selected makes (all models when none selected).
  useEffect(() => {
    fetchModelNames(draft.make || undefined)
      .then(setModelOptions)
      .catch(console.error);
  }, [draft.make]);

  useEffect(() => {
    setLoading(true);
    fetchListings({
      limit: PAGE_SIZE,
      offset: applied.page * PAGE_SIZE,
      make: applied.make,
      model: applied.model,
      search: applied.search,
      fuel: applied.fuel,
      gearbox: applied.gearbox,
      body: applied.body,
      drive: applied.drive,
      price_min: applied.price_min,
      price_max: applied.price_max,
      power_min: applied.power_min,
      power_max: applied.power_max,
      year_min: applied.year_min,
      year_max: applied.year_max,
      mileage_max: applied.mileage_max,
      status: applied.status,
      offer: applied.offer,
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

  function onSortClick(key: SortKey) {
    const [first, second] = SORT_CYCLE[key];
    const sort =
      applied.sort === first ? second : applied.sort === second ? "newest" : first;
    setDraft((f) => ({ ...f, sort }));
    const next = { ...applied, sort, page: 0 };
    setApplied(next);
    persist(next);
  }

  const set = (key: keyof Filters, value: string) =>
    setDraft((f) => ({ ...f, [key]: value }));

  /** Natural language -> filters (the LLM fills the controls below). */
  const smartFilter = async () => {
    const q = smartQuery.trim();
    if (!q) return;
    setSmartBusy(true);
    setSmartNote(null);
    try {
      const res = await askParse(q);
      // The API returns the same keys as the filter controls; numbers are
      // stringified so they fit the form state.
      const parsed = Object.fromEntries(
        Object.entries(res.filters).map(([k, v]) => [k, String(v)]),
      ) as Partial<Filters>;
      const merged: Filters = { ...EMPTY, ...parsed, page: 0 };
      setDraft(merged);
      setApplied(merged);
      persist(merged);
      const keys = Object.keys(res.filters);
      setSmartNote(
        keys.length
          ? `Understood by ${res.source === "llm" ? "LLM" : "rules"}: ${keys.join(", ")}`
          : "Nothing to filter here - showing all cars",
      );
    } catch {
      setSmartNote("Could not understand the request - try different wording");
    } finally {
      setSmartBusy(false);
    }
  };

  return (
    <div>
      {/* Heading */}
      <div className="mt-8 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">
          Listings{" "}
          <span className="text-lg font-normal text-slate-400">
            {total.toLocaleString("en-US")} cars
            {stats && stats.sold_total > 0 && (
              <span> · {stats.sold_total.toLocaleString("en-US")} sold</span>
            )}
          </span>
        </h1>
        {stats?.model_name && (
          <span className="text-sm text-slate-400">Model: {stats.model_name}</span>
        )}
      </div>

      {/* Smart filter: natural language -> the filter controls below */}
      <section className="mt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            smartFilter();
          }}
          className="flex gap-2"
        >
          <input
            value={smartQuery}
            onChange={(e) => setSmartQuery(e.target.value)}
            placeholder='Smart filter (LLM experiment) - write anything in any language, e.g. "kombi do 15 000 €, od 2019, diesel"'
            className="flex-1 rounded border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={smartBusy}
            className="rounded bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {smartBusy ? "Understanding…" : "Smart filter"}
          </button>
        </form>
        {smartNote && <p className="mt-2 text-xs text-slate-400">{smartNote}</p>}
      </section>

      {/* Filter bar */}
      <section className="mt-4 flex flex-wrap items-center gap-2">
        <MultiSelect
          placeholder="Make"
          value={draft.make}
          onChange={(v) => set("make", v)}
          options={(stats?.makes ?? []).map((m) => [m, m])}
        />
        <MultiSelect
          placeholder="Model"
          value={draft.model}
          onChange={(v) => set("model", v)}
          options={modelOptions.map((m) => [m, m])}
        />
        <input
          className={`${inputCls} w-40`}
          value={draft.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Search…"
        />
        <MultiSelect
          placeholder="Fuel"
          value={draft.fuel}
          onChange={(v) => set("fuel", v)}
          options={FUEL_OPTIONS}
        />
        <MultiSelect
          placeholder="Gearbox"
          value={draft.gearbox}
          onChange={(v) => set("gearbox", v)}
          options={GEARBOX_OPTIONS}
        />
        <MultiSelect
          placeholder="Body"
          value={draft.body}
          onChange={(v) => set("body", v)}
          options={BODY_OPTIONS}
        />
        <MultiSelect
          placeholder="Drive"
          value={draft.drive}
          onChange={(v) => set("drive", v)}
          options={DRIVE_FILTER_OPTIONS}
        />
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
          value={draft.power_min}
          onChange={(e) => set("power_min", e.target.value)}
          placeholder="Min kW"
        />
        <input
          className={`${inputCls} w-28`}
          value={draft.power_max}
          onChange={(e) => set("power_max", e.target.value)}
          placeholder="Max kW"
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
          value={draft.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="active">Available</option>
          <option value="sold">Sold</option>
          <option value="all">All listings</option>
        </select>
        <select
          className={inputCls}
          value={draft.offer}
          onChange={(e) => set("offer", e.target.value)}
        >
          <option value="sale">For sale</option>
          <option value="rent">Rent / subscription</option>
          <option value="all">Any offer</option>
        </select>
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
        <table className="w-full min-w-[1250px] text-[15px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-6">Car</th>
              <SortTh label="Year" k="year" sort={applied.sort} onClick={onSortClick} right />
              <SortTh label="KM" k="km" sort={applied.sort} onClick={onSortClick} right />
              <SortTh label="Fuel" k="fuel" sort={applied.sort} onClick={onSortClick} />
              <SortTh label="KW" k="power" sort={applied.sort} onClick={onSortClick} right />
              <th className="px-4 py-2.5">Gearbox</th>
              <th className="px-4 py-2.5">Drive</th>
              <SortTh label="Price" k="price" sort={applied.sort} onClick={onSortClick} right />
              <SortTh label="Fair" k="fair" sort={applied.sort} onClick={onSortClick} right />
              <SortTh label="Profit €" k="profit" sort={applied.sort} onClick={onSortClick} right />
              <SortTh label="Profit %" k="deal" sort={applied.sort} onClick={onSortClick} right />
              <th className="px-4 py-2.5">Deal</th>
              <th className="py-2.5 pl-6" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="py-16 text-center text-slate-400">
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

function SortTh({
  label,
  k,
  sort,
  onClick,
  right,
}: {
  label: string;
  k: SortKey;
  sort: string;
  onClick: (k: SortKey) => void;
  right?: boolean;
}) {
  const active = Object.values(SORT_CYCLE[k]).includes(sort);
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none whitespace-nowrap px-4 py-2.5 hover:text-slate-700 ${
        right ? "text-right" : ""
      }`}
    >
      {label} {active && <span className="text-slate-600">{SORT_ARROW[sort]}</span>}
    </th>
  );
}

function Row({ car }: { car: Listing }) {
  const navigate = useNavigate();
  const sold = car.status === "sold";
  // Profit of the purchase: fair price minus asking price (positive = earn).
  const hasProfit = car.deal_score != null && car.fair_price_eur != null && car.price_eur != null;
  const profitEur = hasProfit ? (car.fair_price_eur ?? 0) - (car.price_eur ?? 0) : null;
  const profitPct = car.deal_score != null ? car.deal_score * 100 : null;
  const profitCls = (v: number) =>
    v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-slate-400";
  const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
  return (
    <tr
      onClick={() => navigate(`/car/${car.id}`)}
      className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
        sold ? "text-slate-400" : ""
      }`}
    >
      <td className={`py-3 pr-6 ${sold ? "" : "font-medium"}`}>{car.title}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
        {car.year}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
        {formatKm(car.mileage_km)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {formatFuel(car.fuel)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600">
        {car.power_kw ?? "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {formatGearbox(car.gearbox)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
        {formatDrive(car.drive)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
        {formatPrice(car.price_eur)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-400">
        {formatPrice(car.fair_price_eur)}
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
          profitEur != null ? profitCls(profitEur) : "text-slate-300"
        }`}
      >
        {profitEur != null
          ? `${sign(profitEur)}${Math.abs(Math.round(profitEur)).toLocaleString("en-US")} €`
          : "—"}
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3 text-right ${
          profitPct != null ? profitCls(profitPct) : "text-slate-300"
        }`}
      >
        {profitPct != null
          ? `${sign(profitPct)}${Math.abs(profitPct).toFixed(0)}%`
          : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {sold ? (
          <span className="text-sm font-medium text-slate-400">Sold</span>
        ) : car.offer_type === "rent" ? (
          <span className="text-sm font-medium text-amber-600">Rental</span>
        ) : (
          <DealBadge verdict={car.deal_verdict} />
        )}
      </td>
      <td className="whitespace-nowrap py-3 pl-6 text-right">
        <a
          href={car.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-slate-400 hover:text-slate-900"
        >
          View listing ↗
        </a>
      </td>
    </tr>
  );
}
