import { useEffect, useState } from "react";
import {
  fetchModelNames,
  fetchStats,
  predict,
  type Prediction,
  type Stats,
} from "../api";
import DealBadge from "../components/DealBadge";
import ExplanationList from "../components/ExplanationList";
import PriceBar from "../components/PriceBar";
import {
  BODY_OPTIONS,
  DRIVE_OPTIONS,
  FUEL_OPTIONS,
  GEARBOX_OPTIONS,
  SELLER_OPTIONS,
  formatPrice,
} from "../components/format";

const DEFAULTS: Record<string, string> = {
  make: "Škoda",
  model: "Octavia",
  year: "2020",
  mileage_km: "120000",
  power_kw: "110",
  engine_cc: "1500",
  fuel: "Benzín",
  gearbox: "manuálna",
  body: "Combi",
  drive: "Predný",
  seller_type: "dealer",
};

const inputCls =
  "mt-1 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";

export default function CalculatorPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ ...DEFAULTS });
  const [askingPrice, setAskingPrice] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

  // Model choices follow the chosen make; keep the form consistent.
  useEffect(() => {
    fetchModelNames(form.make)
      .then((names) => {
        setModelOptions(names);
        setForm((f) => (names.includes(f.model) ? f : { ...f, model: names[0] ?? "" }));
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.make]);

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        year: Number(form.year),
        mileage_km: Number(form.mileage_km),
        power_kw: Number(form.power_kw),
        engine_cc: Number(form.engine_cc),
      };
      if (askingPrice) payload.price_eur = Number(askingPrice);
      setResult(await predict(payload));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold">Price calculator</h1>
      <p className="mt-1 text-slate-500">
        Enter the parameters of a car to estimate its fair market price. Add an
        asking price to see whether it is a good deal.
      </p>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* Form */}
        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Select
              label="Make"
              value={form.make}
              onChange={(v) => set("make", v)}
              options={(stats?.makes ?? []).map((m) => [m, m])}
            />
            <Select
              label="Model"
              value={form.model}
              onChange={(v) => set("model", v)}
              options={modelOptions.map((m) => [m, m])}
            />
            <Input label="Year" value={form.year} onChange={(v) => set("year", v)} />
            <Input
              label="KM"
              value={form.mileage_km}
              onChange={(v) => set("mileage_km", v)}
            />
            <Input label="KW" value={form.power_kw} onChange={(v) => set("power_kw", v)} />
            <Input
              label="Engine (cm³)"
              value={form.engine_cc}
              onChange={(v) => set("engine_cc", v)}
            />
            <Select
              label="Fuel"
              value={form.fuel}
              onChange={(v) => set("fuel", v)}
              options={FUEL_OPTIONS}
            />
            <Select
              label="Gearbox"
              value={form.gearbox}
              onChange={(v) => set("gearbox", v)}
              options={GEARBOX_OPTIONS}
            />
            <Select
              label="Body"
              value={form.body}
              onChange={(v) => set("body", v)}
              options={BODY_OPTIONS}
            />
            <Select
              label="Drive"
              value={form.drive}
              onChange={(v) => set("drive", v)}
              options={DRIVE_OPTIONS}
            />
            <Select
              label="Seller"
              value={form.seller_type}
              onChange={(v) => set("seller_type", v)}
              options={SELLER_OPTIONS}
            />
            <Input
              label="Asking price (optional)"
              value={askingPrice}
              onChange={setAskingPrice}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-6 rounded bg-slate-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Calculating…" : "Estimate fair price"}
          </button>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </form>

        {/* Result */}
        <section>
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
            Result
          </h2>
          {result ? (
            <div className="mt-3">
              <div className="flex items-baseline gap-3">
                <div className="text-4xl font-bold">
                  {formatPrice(result.fair_price_eur)}
                </div>
                {result.deal_verdict && <DealBadge verdict={result.deal_verdict} />}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                typical range {formatPrice(result.interval_low_eur)} –{" "}
                {formatPrice(result.interval_high_eur)} (80% of comparable cars)
              </p>
              <div className="mt-6">
                <PriceBar
                  fair={result.fair_price_eur}
                  low={result.interval_low_eur}
                  high={result.interval_high_eur}
                  actual={askingPrice ? Number(askingPrice) : null}
                />
              </div>
              <div className="mt-8">
                <ExplanationList
                  items={result.explanation}
                  baseline={result.baseline_price_eur}
                />
              </div>
              {result.deal_score != null && (
                <p className="mt-6 text-sm text-slate-600">
                  The asking price is{" "}
                  <b>
                    {result.deal_score > 0
                      ? `${Math.abs(result.deal_score * 100).toFixed(0)}% below fair`
                      : `${Math.abs(result.deal_score * 100).toFixed(0)}% above fair`}
                  </b>
                  .
                </p>
              )}
              <p className="mt-3 text-xs text-slate-400">
                Model: {result.model_name}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-slate-400">
              Fill in the form and the estimate appears here.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[][];
}) {
  return (
    <Field label={label}>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </Field>
  );
}
