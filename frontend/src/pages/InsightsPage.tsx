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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

const euro = (v: number) => `${Math.round(v / 1000)}k €`;

/** Aggregated statistics about the used-car market. */
export default function InsightsPage() {
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
  const byPower: ChartPoint[] = data.power_price.map((d) => ({
    label: d.label,
    value: d.avg_price ?? 0,
  }));
  const byBody: ChartPoint[] = data.bodies.map((d) => ({
    label: d.label,
    value: d.avg_price ?? 0,
  }));
  const sellerNote = data.seller_mix
    .map((s) => `${s.label}: ${euro(s.avg_price ?? 0)} avg`)
    .join(" · ");

  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold">Market insights</h1>
      <p className="mt-1 text-slate-500">
        Statistics aggregated from the currently available offers (real sale
        listings only).
      </p>

      {data.summary && (
        <div className="mt-4 grid grid-cols-2 gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4">
          <Summary label="Offers analyzed" value={data.summary.offers.toLocaleString("en-US")} />
          <Summary label="Average price" value={euro(data.summary.avg_price)} />
          <Summary label="Average mileage" value={`${Math.round(data.summary.avg_km / 1000)}k km`} />
          <Summary label="Electric share" value={`${data.summary.electric_pct}%`} />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Price distribution" note="number of offers per price range">
          <VBars data={data.price_histogram} />
        </ChartCard>

        <ChartCard
          title="Average price by year"
          note="depreciation curve - how value drops with age"
        >
          <LineChart data={byYear} valueFormat={euro} />
        </ChartCard>

        <ChartCard
          title="Average price by mileage"
          note="how much cheaper high-mileage cars are"
        >
          <VBars data={byMileage} valueFormat={euro} />
        </ChartCard>

        <ChartCard
          title="Average price by power"
          note="what stronger engines cost on the market"
        >
          <VBars data={byPower} valueFormat={euro} />
        </ChartCard>

        <ChartCard
          title="Deal score distribution"
          note="how far asking prices sit from the model's fair price"
        >
          <VBars data={data.deal_scores} />
        </ChartCard>

        <ChartCard title="Deal verdicts" note="model's opinion on current offers">
          <HBars
            data={data.verdicts}
            color={(label) => VERDICT_COLORS[label] ?? "#334155"}
          />
        </ChartCard>

        <ChartCard title="New listings per week" note="market activity over time">
          <VBars data={data.new_listings} />
        </ChartCard>

        <ChartCard
          title="Days on market"
          note="how long tracked cars stayed listed before disappearing"
        >
          <VBars data={data.days_on_market} />
        </ChartCard>

        <ChartCard
          title="Fastest selling models"
          note="average days on market (min. 5 sold cars, tracked by this system)"
        >
          <HBars data={data.selling_speed} valueFormat={(v) => `${v} days`} />
        </ChartCard>

        <ChartCard title="Top models" note="number of offers on the market">
          <HBars data={data.top_models} />
        </ChartCard>

        <ChartCard title="Average price by body type" note="SUV vs sedan vs estate…">
          <HBars data={byBody} valueFormat={euro} />
        </ChartCard>

        <ChartCard title="Seller mix" note={sellerNote || undefined}>
          <HBars data={data.seller_mix} />
        </ChartCard>
      </div>
    </div>
  );
}
