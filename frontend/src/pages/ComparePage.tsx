import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchListings, type Listing } from "../api";
import { clearCompare, getCompareIds, toggleCompare } from "../compare";
import DealBadge from "../components/DealBadge";
import {
  formatDrive,
  formatFuel,
  formatGearbox,
  formatKm,
  formatPrice,
} from "../components/format";

/** Side-by-side comparison of up to three cars. */
export default function ComparePage() {
  const [cars, setCars] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    const ids = getCompareIds();
    if (ids.length === 0) {
      setCars([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchListings({ ids: ids.join(","), status: "all", limit: 10 })
      .then((data) => {
        // Keep the order in which the user added the cars.
        const byId = new Map(data.items.map((item) => [item.id, item]));
        setCars(ids.map((id) => byId.get(id)).filter(Boolean) as Listing[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <p className="mt-16 text-center text-slate-400">Loading…</p>;

  if (cars.length === 0) {
    return (
      <div className="mt-16 text-center">
        <h1 className="text-2xl font-bold">Compare cars</h1>
        <p className="mt-2 text-slate-500">
          No cars selected yet. Open a car and press "Add to compare".
        </p>
        <Link to="/" className="mt-4 inline-block text-blue-700 hover:underline">
          ← Browse listings
        </Link>
      </div>
    );
  }

  const rows: { label: string; render: (car: Listing) => React.ReactNode }[] = [
    {
      label: "Price",
      render: (car) => <b>{formatPrice(car.price_eur)}</b>,
    },
    {
      label: "Fair price",
      render: (car) => formatPrice(car.fair_price_eur),
    },
    {
      label: "Profit vs fair",
      render: (car) => {
        if (car.deal_score == null || car.price_eur == null || car.fair_price_eur == null)
          return "—";
        const profit = car.fair_price_eur - car.price_eur;
        return (
          <span className={profit > 0 ? "text-emerald-600" : "text-red-500"}>
            {profit > 0 ? "+" : "−"}
            {Math.abs(Math.round(profit)).toLocaleString("en-US")} € (
            {(car.deal_score * 100).toFixed(0)}%)
          </span>
        );
      },
    },
    { label: "Verdict", render: (car) => <DealBadge verdict={car.deal_verdict} /> },
    { label: "Year", render: (car) => String(car.year) },
    { label: "Mileage", render: (car) => formatKm(car.mileage_km) },
    { label: "Power", render: (car) => (car.power_kw ? `${car.power_kw} kW` : "—") },
    { label: "Engine", render: (car) => (car.engine_cc ? `${car.engine_cc} cm³` : "—") },
    { label: "Fuel", render: (car) => formatFuel(car.fuel) },
    { label: "Gearbox", render: (car) => formatGearbox(car.gearbox) },
    { label: "Body", render: (car) => car.body ?? "—" },
    { label: "Drive", render: (car) => formatDrive(car.drive) },
    {
      label: "Links",
      render: (car) => (
        <span className="text-sm">
          <Link to={`/car/${car.id}`} className="text-blue-700 hover:underline">
            Detail
          </Link>
          {" · "}
          <a href={car.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-900">
            Listing ↗
          </a>
        </span>
      ),
    },
  ];

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Compare cars</h1>
        <button
          onClick={() => {
            clearCompare();
            load();
          }}
          className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          Clear all
        </button>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-[15px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pr-4"> </th>
              {cars.map((car) => (
                <th key={car.id} className="px-4 py-2.5">
                  <Link to={`/car/${car.id}`} className="text-blue-700">
                    {car.title}
                  </Link>
                  <button
                    onClick={() => {
                      toggleCompare(car.id);
                      load();
                    }}
                    className="ml-2 text-slate-300 hover:text-red-500"
                    title="Remove from comparison"
                  >
                    ×
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-slate-100">
                <td className="py-2.5 pr-4 text-slate-400">{row.label}</td>
                {cars.map((car) => (
                  <td key={car.id} className="px-4 py-2.5">
                    {row.render(car)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
