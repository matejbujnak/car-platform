import { useEffect, useState } from "react";
import { fetchCharts, type ChartPoint, type ChartsData } from "../api";
import { HBars, LineChart, VBars } from "../components/charts";

function ChartCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white px-6 py-5">
      <h2 className="text-sm font-medium uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const VERDICT_COLORS: Record<string, string> = {
  cheap: "#059669",
  fair: "#64748b",
  overpriced: "#dc2626",
  suspicious: "#d97706",
};

export default function ChartsPage() {
  const [data, setData] = useState<ChartsData | null>(null);

  useEffect(() => {
    fetchCharts().then(setData).catch(console.error);
  }, []);

  if (!data) return <p className="mt-16 text-center text-slate-400">Loading…</p>;

  const byYear: ChartPoint[] = data.price_by_year.map((d) => ({
    label: d.label,
    value: d.avg_price ?? 0,
  }));
  const byMileage: ChartPoint[] = data.mileage_price.map((d) => ({
    label: d.label,
    value: d.avg_price ?? 0,
  }));

  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold">Market charts</h1>
      <p className="mt-1 text-slate-500">
        Aggregated from the currently available offers (real sale listings only).
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Price distribution" note="number of offers per price range">
          <VBars data={data.price_histogram} />
        </ChartCard>

        <ChartCard
          title="Average price by year"
          note="depreciation curve - how value drops with age"
        >
          <LineChart data={byYear} valueFormat={(v) => `${Math.round(v / 1000)}k €`} />
        </ChartCard>

        <ChartCard
          title="Average price by mileage"
          note="how much cheaper high-mileage cars are"
        >
          <VBars data={byMileage} valueFormat={(v) => `${Math.round(v / 1000)}k €`} />
        </ChartCard>

        <ChartCard title="Deal verdicts" note="model's opinion on current offers">
          <HBars
            data={data.verdicts}
            color={(label) => VERDICT_COLORS[label] ?? "#334155"}
          />
        </ChartCard>

        <ChartCard title="Top makes" note="number of offers on the market">
          <HBars data={data.top_makes} />
        </ChartCard>

        <ChartCard title="Body types" note="number of offers">
          <HBars data={data.bodies} />
        </ChartCard>

        <ChartCard title="Fuel types" note="number of offers">
          <HBars data={data.fuels} />
        </ChartCard>
      </div>
    </div>
  );
}
