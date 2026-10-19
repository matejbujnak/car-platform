const VERDICT_STYLES: Record<string, { label: string; cls: string }> = {
  cheap: { label: "Good deal", cls: "text-emerald-600" },
  fair: { label: "Fair price", cls: "text-slate-400" },
  overpriced: { label: "Overpriced", cls: "text-red-500" },
  suspicious: { label: "Check price", cls: "text-amber-600" },
};

export { VERDICT_STYLES };

export default function DealBadge({ verdict }: { verdict?: string | null }) {
  const style = VERDICT_STYLES[verdict ?? ""] ?? VERDICT_STYLES.fair;
  return <span className={`text-sm font-medium ${style.cls}`}>{style.label}</span>;
}
