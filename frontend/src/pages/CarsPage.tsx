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

// Phones get no sortable table headers - the same sort keys as a dropdown.
const MOBILE_SORTS: [string, string][] = [
  ["newest", "Newest first"],
  ["profit_best", "Biggest profit €"],
  ["deal_best", "Biggest profit %"],
  ["price_low", "Price: low to high"],
  ["price_high", "Price: high to low"],
  ["year_new", "Year: newest"],
  ["year_old", "Year: oldest"],
  ["mileage_low", "Mileage: lowest"],
  ["power_high", "Power: highest"],
];

// Filter keys that count as "active" on the collapsed mobile filter button.
const COUNTED_FILTERS: (keyof Filters)[] = [
  "make", "model", "search", "fuel", "gearbox", "body", "drive",
  "price_min", "price_max", "power_min", "power_max",
  "year_min", "year_max", "mileage_max", "verdict",
];

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
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none";
// Half a row on phones, a fixed / natural width on desktop.
const numCls = `${inputCls} md:w-28`;
const selectCls = `${inputCls} md:w-auto`;

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
  // Mobile only: the filter bar is collapsed behind a button.
  const [filtersOpen, setFiltersOpen] = useState(false);

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
    setFiltersOpen(false);
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
    applySort(sort);
  }

  function applySort(sort: string) {
    setDraft((f) => ({ ...f, sort }));
    const next = { ...applied, sort, page: 0 };
    setApplied(next);
    persist(next);
  }

  const activeFilters = COUNTED_FILTERS.filter((k) => applied[k] !== "").length;

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
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 md:mt-8">
        <h1 className="text-xl font-bold md:text-2xl">
          Listings{" "}
          <span className="text-base font-normal text-slate-400 md:text-lg">
            {total.toLocaleString("en-US")} cars
            {stats && stats.sold_total > 0 && (
              <span> · {stats.sold_total.toLocaleString("en-US")} sold</span>
            )}
          </span>
        </h1>
        {stats?.model_name && (
          <span className="text-xs text-slate-400 md:text-sm">Model: {stats.model_name}</span>
        )}
      </div>

      {/* Smart filter: natural language -> the filter controls below */}
      <section className="mt-4 md:mt-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            smartFilter();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={smartQuery}
            onChange={(e) => setSmartQuery(e.target.value)}
            placeholder='Smart filter (LLM experiment) - write anything in any language, e.g. "kombi do 15 000 €, od 2019, diesel"'
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-4 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
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

      {/* Mobile: filter toggle + sort dropdown (the table headers are desktop only) */}
      <div className="mt-3 flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
            filtersOpen
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-700"
          }`}
        >
          Filters{activeFilters > 0 ? ` (${activeFilters})` : ""} {filtersOpen ? "▴" : "▾"}
        </button>
        <select
          aria-label="Sort"
          className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          value={MOBILE_SORTS.some(([v]) => v === applied.sort) ? applied.sort : ""}
          onChange={(e) => applySort(e.target.value)}
        >
          {!MOBILE_SORTS.some(([v]) => v === applied.sort) && (
            <option value="" disabled>
              Sorted
            </option>
          )}
          {MOBILE_SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Filter bar: a 2-column grid on phones (collapsible), one wrapping row on desktop */}
      <section
        className={`mt-3 grid-cols-2 gap-2 md:mt-4 md:flex md:flex-wrap md:items-center ${
          filtersOpen ? "grid" : "hidden"
        }`}
      >
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
          className={`${inputCls} md:w-40`}
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
          className={numCls}
          value={draft.year_min}
          onChange={(e) => set("year_min", e.target.value)}
          placeholder="Year from"
        />
        <input
          className={numCls}
          value={draft.year_max}
          onChange={(e) => set("year_max", e.target.value)}
          placeholder="Year to"
        />
        <input
          className={numCls}
          value={draft.mileage_max}
          onChange={(e) => set("mileage_max", e.target.value)}
          placeholder="Max km"
        />
        <input
          className={numCls}
          value={draft.power_min}
          onChange={(e) => set("power_min", e.target.value)}
          placeholder="Min kW"
        />
        <input
          className={numCls}
          value={draft.power_max}
          onChange={(e) => set("power_max", e.target.value)}
          placeholder="Max kW"
        />
        <input
          className={numCls}
          value={draft.price_min}
          onChange={(e) => set("price_min", e.target.value)}
          placeholder="Min €"
        />
        <input
          className={numCls}
          value={draft.price_max}
          onChange={(e) => set("price_max", e.target.value)}
          placeholder="Max €"
        />
        <select
          className={selectCls}
          value={draft.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="active">Available</option>
          <option value="sold">Sold</option>
          <option value="all">All listings</option>
        </select>
        <select
          className={selectCls}
          value={draft.offer}
          onChange={(e) => set("offer", e.target.value)}
        >
          <option value="sale">For sale</option>
          <option value="rent">Rent / subscription</option>
          <option value="all">Any offer</option>
        </select>
        <select
          className={selectCls}
          value={draft.verdict}
          onChange={(e) => set("verdict", e.target.value)}
        >
          <option value="">Verdict</option>
          <option value="cheap">Good deals</option>
          <option value="fair">Fair price</option>
          <option value="overpriced">Overpriced</option>
          <option value="suspicious">Check price</option>
        </select>
        <div className="col-span-2 flex gap-2 md:contents">
          <button
            onClick={applyFilters}
            className="flex-1 rounded bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 md:flex-none"
          >
            Filter
          </button>
          <button
            onClick={resetFilters}
            className="rounded border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:text-slate-900 md:border-0 md:px-2"
          >
            Reset
          </button>
        </div>
      </section>

      {/* Phones: one card per car */}
      <section className="mt-4 md:hidden">
        {loading ? (
          <p className="py-16 text-center text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-slate-400">No cars match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-y border-slate-100">
            {items.map((car) => (
              <Card key={car.id} car={car} />
            ))}
          </ul>
        )}
      </section>

      {/* Desktop / tablet: the wide sortable table */}
      <section className="mt-5 hidden overflow-x-auto md:block">
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
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-16 text-center text-slate-400">
                  No cars match these filters.
                </td>
              </tr>
            ) : (
              items.map((car) => <Row key={car.id} car={car} />)
            )}
          </tbody>
        </table>
      </section>

      {/* Pagination */}
      <section className="mt-6 mb-4 flex items-center justify-between gap-3 text-sm sm:justify-center sm:gap-5">
        <button
          onClick={() => gotoPage(Math.max(0, applied.page - 1))}
          disabled={applied.page === 0}
          className="px-1 py-2 text-slate-600 hover:text-slate-900 disabled:text-slate-300"
        >
          ← Previous
        </button>
        <span className="text-slate-400">
          Page {applied.page + 1} of {pages}
        </span>
        <button
          onClick={() => gotoPage(Math.min(pages - 1, applied.page + 1))}
          disabled={applied.page + 1 >= pages}
          className="px-1 py-2 text-slate-600 hover:text-slate-900 disabled:text-slate-300"
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

// Profit of the purchase: fair price minus asking price (positive = earn).
function profitOf(car: Listing) {
  const hasProfit = car.deal_score != null && car.fair_price_eur != null && car.price_eur != null;
  return {
    eur: hasProfit ? (car.fair_price_eur ?? 0) - (car.price_eur ?? 0) : null,
    pct: car.deal_score != null ? car.deal_score * 100 : null,
  };
}

const profitCls = (v: number) =>
  v > 0 ? "text-emerald-600" : v < 0 ? "text-red-500" : "text-slate-400";
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const fmtProfitEur = (v: number) =>
  `${sign(v)}${Math.abs(Math.round(v)).toLocaleString("en-US")} €`;
const fmtProfitPct = (v: number) => `${sign(v)}${Math.abs(v).toFixed(0)}%`;

function Verdict({ car }: { car: Listing }) {
  if (car.status === "sold")
    return <span className="text-sm font-medium text-slate-400">Sold</span>;
  if (car.offer_type === "rent")
    return <span className="text-sm font-medium text-amber-600">Rental</span>;
  return <DealBadge verdict={car.deal_verdict} />;
}

/** Mobile listing card: title + price, specs line, fair price / profit / verdict. */
function Card({ car }: { car: Listing }) {
  const navigate = useNavigate();
  const sold = car.status === "sold";
  const { eur: profitEur, pct: profitPct } = profitOf(car);
  const specs = [
    String(car.year),
    formatKm(car.mileage_km),
    formatFuel(car.fuel),
    car.power_kw ? `${car.power_kw} kW` : null,
    formatGearbox(car.gearbox),
  ].filter((v) => v && v !== "—");
  return (
    <li
      onClick={() => navigate(`/car/${car.id}`)}
      className={`cursor-pointer py-3 active:bg-slate-50 ${sold ? "text-slate-400" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`min-w-0 leading-snug [overflow-wrap:anywhere] ${sold ? "" : "font-medium"}`}>
          {car.title}
        </span>
        <span className="shrink-0 whitespace-nowrap font-semibold">
          {formatPrice(car.price_eur)}
        </span>
      </div>
      <div className="mt-0.5 text-sm text-slate-500">{specs.join(" · ")}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
        {car.fair_price_eur != null && (
          <span className="text-slate-400">fair {formatPrice(car.fair_price_eur)}</span>
        )}
        {profitEur != null && (
          <span className={`font-medium ${profitCls(profitEur)}`}>
            {fmtProfitEur(profitEur)}
            {profitPct != null && (
              <span className="font-normal"> ({fmtProfitPct(profitPct)})</span>
            )}
          </span>
        )}
        <span className="ml-auto">
          <Verdict car={car} />
        </span>
      </div>
    </li>
  );
}

function Row({ car }: { car: Listing }) {
  const navigate = useNavigate();
  const sold = car.status === "sold";
  const { eur: profitEur, pct: profitPct } = profitOf(car);
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
        {profitEur != null ? fmtProfitEur(profitEur) : "—"}
      </td>
      <td
        className={`whitespace-nowrap px-4 py-3 text-right ${
          profitPct != null ? profitCls(profitPct) : "text-slate-300"
        }`}
      >
        {profitPct != null ? fmtProfitPct(profitPct) : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Verdict car={car} />
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
