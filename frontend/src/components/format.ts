export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${Math.round(value).toLocaleString("en-US")} €`;
}

export function formatKm(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("en-US")} km`;
}

export const VERDICT_STYLES: Record<string, { label: string; cls: string }> = {
  cheap: { label: "Good deal", cls: "bg-emerald-100 text-emerald-700" },
  fair: { label: "Fair price", cls: "bg-slate-100 text-slate-600" },
  overpriced: { label: "Overpriced", cls: "bg-rose-100 text-rose-700" },
  suspicious: { label: "Check price", cls: "bg-amber-100 text-amber-700" },
};
