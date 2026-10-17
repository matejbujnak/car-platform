import { VERDICT_STYLES } from "./format";

export default function DealBadge({ verdict }: { verdict?: string | null }) {
  const style = VERDICT_STYLES[verdict ?? ""] ?? VERDICT_STYLES.fair;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium ${style.cls}`}
    >
      {style.label}
    </span>
  );
}
