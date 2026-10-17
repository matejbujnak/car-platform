import { NavLink } from "react-router-dom";
import { VERDICT_STYLES } from "./format";

export default function Header() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-indigo-600 text-white"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚗</span>
          <span className="text-lg font-semibold text-slate-900">
            Car Market Analyzer
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink to="/" className={link} end>
            Cars
          </NavLink>
          <NavLink to="/calculator" className={link}>
            Price calculator
          </NavLink>
          <NavLink to="/admin" className={link}>
            Admin
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

export function DealBadge({ verdict }: { verdict?: string | null }) {
  const style = VERDICT_STYLES[verdict ?? ""] ?? VERDICT_STYLES.fair;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.cls}`}>
      {style.label}
    </span>
  );
}
