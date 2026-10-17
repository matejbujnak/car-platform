import { useState } from "react";
import { predict, type Prediction } from "../api";
import { DealBadge } from "../components/Header";
import PriceBar from "../components/PriceBar";
import { formatPrice } from "../components/format";

const FIELDS = {
  make: "Škoda",
  model: "Octavia",
  year: 2020,
  mileage_km: 120000,
  power_kw: 110,
  engine_cc: 1500,
  fuel: "Benzín",
  gearbox: "manuálna",
  body: "Combi",
  drive: "Predný",
  seller_type: "dealer",
};

export default function CalculatorPage() {
  const [form, setForm] = useState<Record<string, string | number>>({ ...FIELDS });
  const [askingPrice, setAskingPrice] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: string) =>
    setForm((f) => ({
      ...f,
      [key]: ["year", "mileage_km", "power_kw", "engine_cc"].includes(key)
        ? Number(value)
        : value,
    }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (askingPrice) payload.price_eur = Number(askingPrice);
      setResult(await predict(payload));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Price calculator</h1>
        <p className="mt-1 text-slate-500">
          Enter the parameters of a car and the model estimates its fair market
          price. Add an asking price to see whether it is a good deal.
        </p>

        <form onSubmit={onSubmit} className="mt-6 grid grid-cols-2 gap-4">
          <Input label="Make" value={form.make} onChange={(v) => set("make", v)} />
          <Input label="Model" value={form.model} onChange={(v) => set("model", v)} />
          <Input label="Year" value={form.year} onChange={(v) => set("year", v)} />
          <Input
            label="Mileage (km)"
            value={form.mileage_km}
            onChange={(v) => set("mileage_km", v)}
          />
          <Input label="Power (kW)" value={form.power_kw} onChange={(v) => set("power_kw", v)} />
          <Input label="Engine (cm³)" value={form.engine_cc} onChange={(v) => set("engine_cc", v)} />
          <Input label="Fuel" value={form.fuel} onChange={(v) => set("fuel", v)} />
          <Input label="Gearbox" value={form.gearbox} onChange={(v) => set("gearbox", v)} />
          <Input label="Body" value={form.body} onChange={(v) => set("body", v)} />
          <Input label="Drive" value={form.drive} onChange={(v) => set("drive", v)} />
          <Input
            label="Asking price (optional)"
            value={askingPrice}
            onChange={setAskingPrice}
          />
          <div className="col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Calculating…" : "Estimate fair price"}
            </button>
            {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
          </div>
        </form>
      </div>

      <div className="rounded-2xl bg-white p-8 shadow-sm">
        {result ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Estimated fair price</h2>
              {result.deal_verdict && <DealBadge verdict={result.deal_verdict} />}
            </div>
            <div className="mt-2 text-4xl font-bold text-slate-900">
              {formatPrice(result.fair_price_eur)}
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
            {result.deal_score != null && (
              <p className="mt-6 text-sm text-slate-600">
                The asking price is{" "}
                <b>
                  {result.deal_score > 0
                    ? `${Math.abs(result.deal_score * 100).toFixed(0)}% below fair`
                    : `${Math.abs(result.deal_score * 100).toFixed(0)}% above fair`}
                </b>{" "}
                — a {result.deal_verdict === "cheap" ? "good deal" : result.deal_verdict === "overpriced" ? "pass" : "reasonable choice"}.
              </p>
            )}
            <p className="mt-4 text-xs text-slate-400">
              Model: {result.model_name}
            </p>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-slate-400">
            Fill in the form and the estimate appears here.
          </div>
        )}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
      />
    </label>
  );
}
