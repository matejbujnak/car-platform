import { useEffect, useState } from "react";
import {
  fetchStats,
  predict,
  type Prediction,
  type Stats,
} from "../api";
import DealBadge from "../components/DealBadge";
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

export default function CalculatorPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ ...DEFAULTS });
  const [askingPrice, setAskingPrice] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
  }, []);

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
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Price calculator</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter the parameters of a car to estimate its fair market price. Add
          an asking price to see whether it is a good deal.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-4 border border-slate-200 bg-white px-6 py-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Make"
              value={form.make}
              onChange={(v) => set("make", v)}
              options={(stats?.makes ?? []).map((m) => [m, m])}
            />
            <Input label="Model" value={form.model} onChange={(v) => set("model", v)} />
            <Input label="Year" value={form.year} onChange={(v) => set("year", v)} />
            <Input
              label="Mileage (km)"
              value={form.mileage_km}
              onChange={(v) => set("mileage_km", v)}
            />
            <Input
              label="Power (kW)"
              value={form.power_kw}
              onChange={(v) => set("power_kw", v)}
            />
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
            className="mt-5 w-full rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? "Calculating…" : "Estimate fair price"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </form>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-slate-900">Result</h2>
        <div className="mt-1 min-h-64 border border-slate-200 bg-white px-6 py-5">
          {result ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Estimated fair price</span>
                {result.deal_verdict && <DealBadge verdict={result.deal_verdict} />}
              </div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">
                {formatPrice(result.fair_price_eur)}
              </div>
              <p className="mt-1 text-sm text-slate-500">
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
              <p className="mt-4 text-xs text-slate-400">
                Model: {result.model_name}
              </p>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-slate-400">
              Fill in the form and the estimate appears here.
            </p>
          )}
        </div>
      </div>
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-blue-600 focus:outline-none"
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
